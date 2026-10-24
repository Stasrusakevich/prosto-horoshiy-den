import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadCache} from '../lib/read-cache.mjs';

test('Concurrent visitors share a read; callers cannot mutate cached data; TTL expires',async()=>{
  let reads=0,time=0;
  const cache=createReadCache(async()=>({guests:[{name:'Guest'}],read:++reads}),{now:()=>time,ttlMs:60});
  const values=await Promise.all(Array.from({length:100},()=>cache.read()));
  assert.equal(reads,1);
  values[0].guests[0].name='Changed';
  assert.equal(values[1].guests[0].name,'Guest');
  assert.equal((await cache.read()).guests[0].name,'Guest');
  time=60;assert.equal((await cache.read()).read,2);
});

test('Successful mutations invalidate the previous public snapshot',async()=>{
  let stored=1;
  const cache=createReadCache(async()=>stored);
  assert.equal(await cache.read(),1);
  stored=2;cache.clear();assert.equal(await cache.read(),2);
});

test('Storage failures have a cooldown instead of one upstream read per visitor',async()=>{
  let time=0,reads=0,broken=true;
  const error=new Error('Storage unavailable');
  const cache=createReadCache(async()=>{reads++;if(broken)throw error;return 'recovered';},{now:()=>time,errorTtlMs:30});
  const results=await Promise.allSettled(Array.from({length:100},()=>cache.read()));
  assert.equal(reads,1);assert.ok(results.every(r=>r.status==='rejected'&&r.reason===error));
  broken=false;await assert.rejects(cache.read(),/Storage unavailable/);assert.equal(reads,1);
  time=30;assert.equal(await cache.read(),'recovered');assert.equal(reads,2);
});

test('An older in-flight read cannot repopulate the cache after a write',async()=>{
  let finishOld,reads=0;
  const cache=createReadCache(()=>++reads===1?new Promise(resolve=>{finishOld=resolve;}):'new');
  const old=cache.read();await Promise.resolve();
  cache.clear();assert.equal(await cache.read(),'new');
  finishOld('old');assert.equal(await old,'old');
  assert.equal(await cache.read(),'new');assert.equal(reads,2);
});
