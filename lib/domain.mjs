import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export const emptyState=()=>({schema:1,responses:{},photos:{},limits:{}});
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function guestId(token){if(!/^[A-Za-z0-9_-]{43}$/.test(token||''))throw new HttpError(401,'Нужен личный код ответа.');return hash(token);}
export function cleanText(value,max,required=false){
  if(value!=null&&typeof value!=='string')throw new HttpError(400,'Проверь текстовые поля.');
  const text=(value||'').trim();
  if(text.length>max||(required&&!text))throw new HttpError(400,required?'Введи имя и проверь длину полей.':'Слишком длинный текст.');
  return text;
}
export function validateAnswer(input){
  if(!['yes','maybe','no'].includes(input.status))throw new HttpError(400,'Выбери, получится ли прийти.');
  const out={name:cleanText(input.name,90,true),status:input.status};
  for(const [key,min,max] of [['adults',1,10],['children',0,10]]){
    const value=Number(input[key]??(key==='adults'?1:0));
    if(!Number.isInteger(value)||value<min||value>max)throw new HttpError(400,'Проверь количество гостей.');
    out[key]=value;
  }
  for(const [key,max] of [['ages',80],['companions',160],['food',600],['song',160],['reason',220],['goodDay',240]])out[key]=cleanText(input[key],max);
  if(!['','wine','gin','whisky','cocktail','later'].includes(input.drink||''))throw new HttpError(400,'Выбери напиток из списка.');
  out.drink=input.drink||'';
  if(!out.children)out.ages='';
  return out;
}
export function saveResponse(state,id,input,expectedVersion){
  const old=state.responses[id];
  if((old?.version||0)!==Number(expectedVersion||0))throw new HttpError(409,'Ответ уже изменён в другом окне. Обнови страницу перед сохранением.');
  if(!old&&Object.keys(state.responses).length>=150)throw new HttpError(429,'Список заполнен. Напиши Стасу.');
  const answer=validateAnswer(input),now=new Date().toISOString();
  const result={...answer,id,version:(old?.version||0)+1,createdAt:old?.createdAt||now,updatedAt:now};
  state.responses[id]=result;
  return result;
}
export function limit(state,key,max,windowMs=60_000){
  const now=Date.now();
  for(const [id,value] of Object.entries(state.limits))if(value.until<=now)delete state.limits[id];
  const bucket=state.limits[key]||{count:0,until:now+windowMs};
  if(bucket.count>=max)throw new HttpError(429,'Слишком много попыток. Подожди немного и попробуй снова.');
  bucket.count++;state.limits[key]=bucket;
}
export function publicData(state){
  return {
    guests:Object.values(state.responses).filter(g=>g.status==='yes').map(g=>({id:g.id,name:g.name,status:g.status,adults:g.adults,children:g.children,companions:g.companions,song:g.song,reason:g.reason,goodDay:g.goodDay,drink:g.drink})),
    tracks:Object.values(state.responses).filter(g=>g.status!=='no'&&g.song).map(g=>({name:g.name,song:g.song,reason:g.reason})),
    photos:Object.values(state.photos).filter(p=>!p.hidden&&!p.deleted).map(p=>({id:p.id,name:state.responses[p.ownerId]?.name||'Гость',caption:p.caption,createdAt:p.createdAt})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  };
}
export function passwordHash(password,salt=randomBytes(16).toString('hex')){return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function verifyPassword(password,encoded){
  if(typeof password!=='string'||password.length>200||!encoded)return false;
  const [salt,value]=encoded.split(':');if(!salt||!value)return false;
  const actual=scryptSync(password,salt,64),expected=Buffer.from(value,'hex');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function sessionToken(secret){const payload=Buffer.from(JSON.stringify({exp:Date.now()+8*3600_000,nonce:randomBytes(16).toString('hex')})).toString('base64url');return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');}
export function validSession(token,secret){
  try{if(!secret||!token)return false;const [payload,sig,...extra]=token.split('.');if(extra.length||!sig)return false;const expected=createHmac('sha256',secret).update(payload).digest();const actual=Buffer.from(sig,'base64url');return actual.length===expected.length&&timingSafeEqual(actual,expected)&&JSON.parse(Buffer.from(payload,'base64url').toString()).exp>Date.now();}catch{return false;}
}
