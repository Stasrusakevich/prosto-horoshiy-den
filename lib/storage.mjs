import { get, put, del, BlobPreconditionFailedError } from '@vercel/blob';
import { emptyState, HttpError } from './domain.mjs';

export function createStore(adapter){
  return {
    read:async()=>{const record=await adapter.read();return record?.value||emptyState();},
    async update(change){
      for(let attempt=0;attempt<8;attempt++){
        const record=await adapter.read();
        const state=record?structuredClone(record.value):emptyState();
        const result=change(state);
        try{await adapter.write(state,record?.etag);return result;}
        catch(error){if(!adapter.conflict(error))throw error;await new Promise(r=>setTimeout(r,70+Math.random()*160*(attempt+1)));}
      }
      throw new HttpError(503,'Сейчас отвечают несколько гостей. Попробуй сохранить ещё раз — поля не потерялись.');
    }
  };
}
const namespace=process.env.BIRTHDAY_DATA_NAMESPACE||'birthday';
if(!/^[a-z0-9-]+$/.test(namespace))throw new Error('Invalid storage namespace');
const statePath=namespace+'/state-v1.json';
export const store=createStore({
  // Compressed reads add W/ to the same storage version; writes require its strong form.
  async read(){const result=await get(statePath,{access:'private',useCache:false});if(!result)return null;return {value:await new Response(result.stream).json(),etag:result.blob.etag.replace(/^W\//,'')};},
  async write(state,etag){await put(statePath,JSON.stringify(state),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),cacheControlMaxAge:60});},
  conflict:error=>error instanceof BlobPreconditionFailedError||['BlobPreconditionFailedError','BlobAlreadyExistsError'].includes(error.name)||/already exists/i.test(error.message)
});
export const images={
  put:async(id,buffer)=>put(`${namespace}/photos/${id}.jpg`,buffer,{access:'private',contentType:'image/jpeg',addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:60}),
  get:async id=>get(`${namespace}/photos/${id}.jpg`,{access:'private',useCache:false}),
  del:async id=>del(`${namespace}/photos/${id}.jpg`)
};
