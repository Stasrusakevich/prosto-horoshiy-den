import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { store as backingStore, images } from '../lib/storage.mjs';
import { createReadCache } from '../lib/read-cache.mjs';
import { HttpError, guestId, hash, cleanText, saveResponse, setResponseDeleted, limit, publicData, verifyPassword, sessionToken, validSession } from '../lib/domain.mjs';

const publicCache=createReadCache(async()=>publicData(await backingStore.read()));
const store={read:backingStore.read,async update(change){const result=await backingStore.update(change);publicCache.clear();return result;}};

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const tokenFrom=req=>(req.headers.authorization||'').replace(/^Bearer /,'');
const adminFrom=req=>validSession((req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('birthday_admin='))?.slice(15),process.env.SESSION_SECRET);
const json=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
async function body(req){
  if(req.body!==undefined){const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw)>3_000_000)throw new HttpError(413,'Фото слишком большое. Выбери другое.');try{return JSON.parse(raw);}catch{throw new HttpError(400,'Не удалось прочитать запрос.');}}
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>3_000_000)throw new HttpError(413,'Фото слишком большое. Выбери другое.');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new HttpError(400,'Не удалось прочитать запрос.');}
}
function checkWrite(req){
  if(req.headers['x-requested-with']!=='birthday')throw new HttpError(403,'Открой форму на сайте приглашения.');
  const origin=req.headers.origin;
  const origins=[process.env.APP_ORIGIN,process.env.VERCEL_URL&&`https://${process.env.VERCEL_URL}`];
  if(!process.env.VERCEL)origins.push('http://127.0.0.1:4183');
  if(origin&&!origins.includes(origin))throw new HttpError(403,'Этот адрес не может изменять ответы.');
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  try{
    if(!process.env.BLOB_READ_WRITE_TOKEN||!process.env.SESSION_SECRET||!process.env.ADMIN_PASSWORD_HASH)throw new HttpError(503,'Сервис ещё настраивается. Попробуй позже.');
    const url=new URL(req.url,'https://birthday.local'),action=url.searchParams.get('action')||'public';
    const isAdmin=adminFrom(req);
    if(req.method==='GET'){
      if(action==='public')return json(res,200,await publicCache.read());
      if(action==='admin'&&!isAdmin)throw new HttpError(401,'Войди в кабинет организатора.');
      if(action==='me')guestId(tokenFrom(req));
      if(action==='photo'&&!UUID.test(url.searchParams.get('id')||''))throw new HttpError(404,'Фото не найдено.');
      if(!['me','admin','photo'].includes(action))throw new HttpError(404,'Страница не найдена.');
      const state=await store.read();
      if(action==='me'){const id=guestId(tokenFrom(req));return json(res,200,{answer:state.responses[id]?.deletedAt?null:state.responses[id]||null,photos:Object.values(state.photos).filter(p=>p.ownerId===id&&!p.deleted).map(p=>({id:p.id,caption:p.caption,hidden:p.hidden}))});}
      if(action==='admin'){if(!isAdmin)throw new HttpError(401,'Войди в кабинет организатора.');return json(res,200,{guests:Object.values(state.responses).filter(g=>!g.deletedAt),deletedGuests:Object.values(state.responses).filter(g=>g.deletedAt),photos:Object.values(state.photos).filter(p=>!p.deleted&&!state.responses[p.ownerId]?.deletedAt).map(p=>({...p,name:state.responses[p.ownerId]?.name||'Гость'}))});}
      if(action==='photo'){
        const id=url.searchParams.get('id');if(!UUID.test(id||''))throw new HttpError(404,'Фото не найдено.');
        const photo=state.photos[id];if(!photo||photo.deleted||((photo.hidden||state.responses[photo.ownerId]?.deletedAt)&&!isAdmin))throw new HttpError(404,'Фото не найдено.');
        const result=await images.get(id);if(!result)throw new HttpError(404,'Фото не найдено.');
        res.setHeader('Content-Type','image/jpeg');res.setHeader('Content-Disposition','inline; filename="photo.jpg"');
        const buffer=Buffer.from(await new Response(result.stream).arrayBuffer());return res.end(buffer);
      }
      throw new HttpError(404,'Страница не найдена.');
    }
    if(req.method!=='POST')throw new HttpError(405,'Метод не поддерживается.');
    checkWrite(req);const input=await body(req);
    const ip=hash(String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown')+'|'+process.env.SESSION_SECRET).slice(0,32);
    if(action==='login'){
      await store.update(s=>limit(s,'login:'+ip,8,15*60_000));
      if(!verifyPassword(input.password,process.env.ADMIN_PASSWORD_HASH))throw new HttpError(401,'Неверный пароль.');
      res.setHeader('Set-Cookie',`birthday_admin=${sessionToken(process.env.SESSION_SECRET)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.VERCEL?'; Secure':''}`);return json(res,200,{ok:true});
    }
    if(action==='logout'){res.setHeader('Set-Cookie','birthday_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
    if(action==='answer'){
      const id=guestId(tokenFrom(req));
      const answer=await store.update(s=>{limit(s,'answer:'+ip,25);return saveResponse(s,id,input,input.version);});
      return json(res,200,{answer});
    }
    if(action==='photo'){
      const ownerId=guestId(tokenFrom(req));
      const before=await store.read();if(!before.responses[ownerId]||before.responses[ownerId].deletedAt)throw new HttpError(403,'Сначала сохрани своё имя в анкете.');
      await store.update(s=>limit(s,'upload:'+ip,12,10*60_000));
      const caption=cleanText(input.caption,200);
      if(typeof input.image!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(input.image))throw new HttpError(400,'Выбери фото JPG, PNG или WebP.');
      const source=Buffer.from(input.image.split(',')[1],'base64');if(source.length>2_000_000)throw new HttpError(413,'Фото слишком большое.');
      let buffer;
      try{buffer=await sharp(source,{limitInputPixels:24_000_000,animated:false}).rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer();}catch{throw new HttpError(400,'Не удалось прочитать фото. Выбери другой файл.');}
      if(buffer.length>2_000_000)throw new HttpError(413,'Фото слишком большое.');
      const id=randomUUID();await images.put(id,buffer);
      try{
        await store.update(s=>{const all=Object.values(s.photos).filter(p=>!p.deleted);if(all.length>=200||all.filter(p=>p.ownerId===ownerId).length>=5)throw new HttpError(400,'Можно добавить до пяти фотографий.');s.photos[id]={id,ownerId,caption,createdAt:new Date().toISOString(),hidden:false};});
      }catch(error){await images.del(id).catch(()=>{});throw error;}
      return json(res,201,{id});
    }
    if(action==='photo-remove'){
      const id=guestId(tokenFrom(req));
      await store.update(s=>{const p=s.photos[input.id];if(!p||p.ownerId!==id)throw new HttpError(403,'Можно убрать только своё фото.');p.deleted=true;});
      await images.del(input.id).catch(()=>{});return json(res,200,{ok:true});
    }
    if(action==='admin-answer'){
      if(!isAdmin)throw new HttpError(401,'Войди в кабинет организатора.');
      const id=input.id||hash(randomUUID());if(!/^[a-f0-9]{64}$/.test(id))throw new HttpError(400,'Неверный ответ.');
      const answer=await store.update(s=>saveResponse(s,id,{...s.responses[id],...input},input.version));return json(res,200,{answer});
    }
    if(action==='admin-photo'){
      if(!isAdmin)throw new HttpError(401,'Войди в кабинет организатора.');
      await store.update(s=>{const p=s.photos[input.id];if(!p||p.deleted)throw new HttpError(404,'Фото не найдено.');p.hidden=!!input.hidden;});return json(res,200,{ok:true});
    }
    if(action==='admin-delete-answer'||action==='admin-restore-answer'){
      if(!isAdmin)throw new HttpError(401,'Войди в кабинет организатора.');
      const answer=await store.update(s=>setResponseDeleted(s,input.id,action==='admin-delete-answer',input.version));
      return json(res,200,{answer});
    }
    throw new HttpError(404,'Действие не найдено.');
  }catch(error){
    if(!error.status)console.error('Birthday API failure:',error.name, !process.env.VERCEL ? String(error.message).replace(/vercel_blob_[\w-]+/g,'[redacted]') : '');
    json(res,error.status||503,{error:error.status?error.message:'Ответы и фотографии временно недоступны. Приглашение и адрес работают. Пока можно ответить Стасу в личном чате.'});
  }
}
