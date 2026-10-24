// Per-function-instance cache; never used for private responses or writes.
export function createReadCache(load,{ttlMs=60000,errorTtlMs=30000,now=Date.now}={}){
  let entry=null,pending=null,generation=0;
  return {
    clear(){entry=null;pending=null;generation++;},
    async read(){
      if(entry&&entry.until>now()){if(entry.error)throw entry.error;return structuredClone(entry.value);}
      if(pending)return structuredClone(await pending);
      const version=generation;
      const task=Promise.resolve().then(load).then(value=>{
        if(generation===version)entry={value:structuredClone(value),until:now()+ttlMs};
        return value;
      },error=>{if(generation===version)entry={error,until:now()+errorTtlMs};throw error;});
      pending=task;
      try{return structuredClone(await task);}finally{if(pending===task)pending=null;}
    }
  };
}
