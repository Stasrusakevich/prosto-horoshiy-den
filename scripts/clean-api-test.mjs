import fs from 'node:fs';
import assert from 'node:assert/strict';
import {store,images} from '../lib/storage.mjs';
const {ids,photoIds}=JSON.parse(fs.readFileSync('.local-data/last-api-test.json','utf8'));
await store.update(s=>{
 for(const id of ids){const g=s.responses[id];if(g){assert.ok(['QA Первый','QA Второй'].includes(g.name));delete s.responses[id];}}
 for(const id of photoIds){const p=s.photos[id];if(p){assert.ok(ids.includes(p.ownerId));delete s.photos[id];}}
});
for(const id of photoIds)await images.del(id);
console.log('Removed only synthetic records listed in the test manifest.');
