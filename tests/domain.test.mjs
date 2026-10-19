import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {emptyState,saveResponse,setResponseDeleted,publicData,guestId,passwordHash,verifyPassword,sessionToken,validSession,limit} from '../lib/domain.mjs';
import {createStore} from '../lib/storage.mjs';
const answer={name:'Тест',status:'yes',adults:2,children:1,ages:'7',food:'Только организатору',drink:'wine',song:'Песня',reason:'Причина',goodDay:'Встреча',companions:'Друг'};
test('Removing a response hides its people, song and photos; restoring retains data',()=>{
 const s=emptyState();saveResponse(s,'one',answer,0);saveResponse(s,'two',{...answer,name:'Другой'},0);
 s.photos.a={id:'a',ownerId:'one',caption:'Фото',createdAt:'2026-01-01'};
 assert.throws(()=>setResponseDeleted(s,'one',true,0),{status:409});
 setResponseDeleted(s,'one',true,1);
 const data=publicData(s);assert.deepEqual(data.guests.map(g=>g.name),['Другой']);assert.equal(data.tracks.length,1);assert.equal(data.photos.length,0);
 assert.throws(()=>saveResponse(s,'one',answer,2),{status:410});
 assert.throws(()=>setResponseDeleted(s,'one',false,1),{status:409});
 setResponseDeleted(s,'one',false,2);assert.equal(publicData(s).guests.length,2);assert.equal(publicData(s).photos.length,1);assert.equal(s.responses.one.food,answer.food);assert.equal(s.responses.one.version,3);
});
test('Public views never reveal food notes, ages, rejected guests or hidden photos',()=>{
 const state=emptyState();saveResponse(state,'one',answer,0);saveResponse(state,'two',{...answer,status:'no'},0);
 state.photos.a={id:'a',ownerId:'one',hidden:false,caption:'Фото',createdAt:'2026-01-01'};state.photos.b={id:'b',ownerId:'two',hidden:true};
 const data=publicData(state);assert.equal(data.guests.length,1);assert.equal(data.tracks.length,1);assert.equal(data.photos.length,1);
 assert.equal('food' in data.guests[0],false);assert.equal('ages' in data.guests[0],false);assert.equal('ownerId' in data.photos[0],false);assert.equal(JSON.stringify(data).includes('Только организатору'),false);
});
test('Required name, safe counts and known drink values are enforced on server',()=>{
 for(const patch of [{name:'   '},{adults:0},{children:-1},{children:1.2},{drink:'unknown'},{song:'x'.repeat(161)}])assert.throws(()=>saveResponse(emptyState(),'one',{...answer,...patch},0));
});
test('Stale updates cannot silently overwrite newer answers',()=>{const s=emptyState();saveResponse(s,'one',answer,0);saveResponse(s,'one',{...answer,name:'Изменено'},1);assert.throws(()=>saveResponse(s,'one',answer,1),{status:409});assert.equal(s.responses.one.name,'Изменено');});
test('Guest edit codes are independent and validated',()=>{const a=randomBytes(32).toString('base64url'),b=randomBytes(32).toString('base64url');assert.notEqual(guestId(a),guestId(b));assert.throws(()=>guestId('Тест'),{status:401});});
test('Host password and signed session reject incorrect or tampered credentials',()=>{const secret='test-session-secret';const encoded=passwordHash('test password');assert.ok(verifyPassword('test password',encoded));assert.equal(verifyPassword('wrong',encoded),false);const token=sessionToken(secret);assert.ok(validSession(token,secret));assert.equal(validSession(token+'x',secret),false);assert.equal(validSession(token,'other'),false);});
test('Rate limiting counts attempts and rejects excess',()=>{const s=emptyState();limit(s,'test',2);limit(s,'test',2);assert.throws(()=>limit(s,'test',2),{status:429});});
test('Concurrent guests are retained through conditional writes',async()=>{
 let current=null,rev=0;
 const store=createStore({read:async()=>current?structuredClone(current):null,write:async(value,etag)=>{await new Promise(r=>setTimeout(r,2));if(etag!==current?.etag){const e=new Error('conflict');e.name='Conflict';throw e;}current={value:structuredClone(value),etag:String(++rev)};},conflict:e=>e.name==='Conflict'});
 await Promise.all(Array.from({length:12},(_,i)=>store.update(s=>saveResponse(s,String(i),{...answer,name:'Гость '+i},0))));
 assert.equal(Object.keys((await store.read()).responses).length,12);
});
