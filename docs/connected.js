// Shared data, guest edit codes and the host's authenticated session.
async function api(action,{method='GET',data,token=guestToken}={}){
  const headers={};if(token)headers.Authorization='Bearer '+token;
  if(method==='POST'){headers['Content-Type']='application/json';headers['X-Requested-With']='birthday';}
  let response;try{response=await fetch('./api/index?action='+action,{method,headers,body:data?JSON.stringify(data):undefined,cache:'no-store',credentials:'same-origin'});}catch{throw new Error('Нет связи с сервером. Проверь интернет и попробуй снова.');}
  const result=await response.json().catch(()=>({error:'Сервис временно недоступен. Попробуй позже.'}));
  if(!response.ok){const error=new Error(result.error||'Не удалось выполнить действие.');error.status=response.status;throw error;}return result;
}
function newCode(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
function rememberCode(value){guestToken=value;try{localStorage.setItem(TOKEN_KEY,value);}catch{toast('Сохрани личный код: браузер не запомнит его после закрытия.');}}
async function refresh({own=false,admin=false}={}){
  const data=await api('public',{token:''});photos=data.photos;publicTracks=data.tracks;
  let publicGuests=data.guests;
  if(own&&guestToken){const mine=await api('me');ownAnswer=mine.answer;ownPhotos=mine.photos;}
  if(admin||isAdmin){try{const host=await api('admin',{token:''});isAdmin=true;guests=host.guests;adminPhotos=host.photos;}catch(error){if(error.status!==401)throw error;isAdmin=false;guests=publicGuests;}}
  else guests=publicGuests;
  loadError='';loading=false;
}
async function boot(){try{await refresh({own:true,admin:route()==='admin'});}catch(error){loading=false;loadError=error.message;}render();}
function recoveryPanel(){return `<details class="recovery"><summary>Мой ответ на другом устройстве</summary><p>Личный код позволяет открыть и изменить только твой ответ. Сохрани его для себя и не передавай другим.</p>${ownAnswer?`<label class="field">Твой личный код<input readonly value="${esc(guestToken)}" autocomplete="off"></label><button type="button" class="button small-btn" data-action="copy-code">Скопировать код</button>`:''}<form id="recover-form"><label class="field">Уже отвечал с другого устройства?<input name="code" required autocomplete="off" placeholder="Вставь свой личный код" maxlength="43" minlength="43"></label><button class="button small-btn" type="submit">Открыть мой ответ</button></form><p class="form-error" id="recover-error" role="alert"></p></details>`;}
function loginPage(){return `${pageHeading('Только для организатора','Для Стаса.','Войди, чтобы видеть все ответы, пожелания по еде и управлять фотографиями.')}<form id="login-form" class="login-form"><label class="field">Пароль<input type="password" name="password" autocomplete="current-password" required maxlength="200"></label><button class="button primary" type="submit">Войти ↗</button><p id="login-error" class="form-error" role="alert"></p></form>`;}
const imageUrl=id=>'./api/index?action=photo&id='+encodeURIComponent(id);
function photoCards(items,host=false){return items.length?`<div class="photo-grid">${items.map(p=>`<figure class="photo-card"><a href="${imageUrl(p.id)}" target="_blank" rel="noopener"><img src="${imageUrl(p.id)}" alt="${esc(p.caption||'Фото со Стасом')}" loading="lazy" width="600" height="450"></a><figcaption><strong>${esc(p.name||currentGuest().name)}</strong>${p.caption?`<p>${esc(p.caption)}</p>`:''}${host?`<button class="button small-btn" data-action="moderate-photo" data-id="${esc(p.id)}" data-hidden="${!p.hidden}">${p.hidden?'Показать гостям':'Скрыть из галереи'}</button>`:''}</figcaption></figure>`).join('')}</div>`:'<div class="empty">Здесь будут наши совместные фотографии. Добавь первую.</div>';}
function gallery(){return `${pageHeading('Уже есть что вспомнить','Фото со мной.','Нашёл совместное фото? Добавь его сюда — соберём галерею нашей компании.')}<div class="photo-intro"><p>Фотографии и подписи видны всем, у кого есть ссылка на сайт. До 5 фото от каждого, JPG, PNG или WebP. Большие снимки уменьшим перед загрузкой.</p>${ownAnswer?`<form id="photo-form"><label class="field">Выбери фото<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required></label><label class="field">Пара слов о моменте<input name="caption" maxlength="200" placeholder="Где и когда это было — если хочется"></label><button class="button primary" type="submit">Добавить в галерею ↗</button><p id="photo-progress" role="status"></p><p id="photo-error" class="form-error" role="alert"></p></form>`:'<a class="button primary" href="#rsvp">Сначала представиться ↗</a>'}</div>${ownPhotos.length?`<details class="recovery"><summary>Мои фотографии (${ownPhotos.length} из 5)</summary>${ownPhotos.map(p=>`<div class="my-photo"><span>${esc(p.caption||'Фото без подписи')}${p.hidden?' · скрыто Стасом':''}</span><button class="button small-btn" data-action="remove-photo" data-id="${esc(p.id)}">Убрать моё фото</button></div>`).join('')}</details>`:''}${photoCards(photos)}`;}
async function withForm(form,operation,errorId){
  if(form.dataset.busy)return;form.dataset.busy='true';const button=form.querySelector('[type=submit]');if(button)button.disabled=true;
  const errorBox=document.getElementById(errorId);if(errorBox)errorBox.textContent='';
  try{await operation();}catch(error){if(errorBox)errorBox.textContent=error.message;else toast(error.message);}finally{delete form.dataset.busy;if(button)button.disabled=false;}
}
async function saveAnswer(form){return withForm(form,async()=>{
  const data=new FormData(form),answer={...currentGuest()};
  answer.name=String(data.get('name')||'').trim();if(!answer.name)throw new Error('Введи имя.');
  answer.status=data.get('status');
  if(answer.status!=='no'){
    for(const key of ['adults','children'])answer[key]=Number(data.get(key));
    for(const key of ['ages','companions','food','song','reason','goodDay','drink'])answer[key]=String(data.get(key)||'').trim();
  }
  if(!guestToken)rememberCode(newCode());
  const result=await api('answer',{method:'POST',data:answer});ownAnswer=result.answer;
  try{await refresh({own:true});}catch{loadError='Ответ сохранён. Обновить общий список сейчас не удалось.';}
  render();window.scrollTo({top:0,behavior:'smooth'});toast('Ответ сохранён. Стас его увидит.');
},'form-error');}
async function saveGuest(form){return withForm(form,async()=>{
  const data=new FormData(form),id=String(data.get('id')||''),old=guests.find(g=>g.id===id);
  await api('admin-answer',{method:'POST',data:{...old,id,name:String(data.get('name')||'').trim(),adults:Number(data.get('adults')),status:old?.status==='none'?'maybe':old?.status||'maybe',children:old?.children||0}});
  await refresh({admin:true,own:true});document.getElementById('guest-dialog').close();render();toast('Сохранено.');
});}
async function compressPhoto(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Выбери фото JPG, PNG или WebP. Для HEIC сначала сохрани копию в JPG.');
  if(file.size>20*1024*1024)throw new Error('Выбери фото размером до 20 МБ.');
  const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('Не удалось открыть фото. Попробуй другой файл.');});
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const data=canvas.toDataURL('image/jpeg',.82);if(data.length>2_600_000)throw new Error('Фото слишком большое после обработки. Выбери другой снимок.');return data;
}
document.addEventListener('submit',e=>{
  const form=e.target;
  if(form.matches('#rsvp-form')){e.preventDefault();saveAnswer(form);}
  if(form.matches('#guest-editor')){e.preventDefault();saveGuest(form);}
  if(form.matches('#login-form')){e.preventDefault();withForm(form,async()=>{await api('login',{method:'POST',data:{password:form.elements.password.value},token:''});await refresh({admin:true});render();},'login-error');}
  if(form.matches('#recover-form')){e.preventDefault();withForm(form,async()=>{const code=form.elements.code.value.trim();const data=await api('me',{token:code});if(!data.answer)throw new Error('Ответ с таким кодом не найден. Проверь код.');rememberCode(code);ownAnswer=data.answer;ownPhotos=data.photos;render();toast('Твой ответ открыт.');},'recover-error');}
  if(form.matches('#photo-form')){e.preventDefault();withForm(form,async()=>{const progress=document.getElementById('photo-progress');progress.textContent='Подготавливаем фото…';const image=await compressPhoto(form.elements.photo.files[0]);progress.textContent='Загружаем…';await api('photo',{method:'POST',data:{image,caption:form.elements.caption.value}});await refresh({own:true});render();toast('Фото добавлено в общую галерею.');},'photo-error');}
});
document.addEventListener('change',async e=>{
  if(e.target.closest('#rsvp-form')&&['status','children'].includes(e.target.name))syncFormVisibility();
  if(e.target.id==='status-filter'){adminFilter=e.target.value;document.getElementById('admin-list').innerHTML=adminRows();}
  if(e.target.dataset.guestStatus){const g=guests.find(x=>x.id===e.target.dataset.guestStatus);e.target.disabled=true;try{await api('admin-answer',{method:'POST',data:{...g,status:e.target.value}});await refresh({admin:true,own:true});render();toast('Статус обновлён.');}catch(error){e.target.disabled=false;e.target.value=g.status;toast(error.message);}}
});
document.addEventListener('input',e=>{if(e.target.closest('#rsvp-form')&&e.target.name==='children')syncFormVisibility();if(e.target.id==='guest-search'){adminSearch=e.target.value;document.getElementById('admin-list').innerHTML=adminRows();}});
document.addEventListener('click',async e=>{
  const tab=e.target.closest('[data-admin-tab]');if(tab){adminTab=tab.dataset.adminTab;render();return;}
  const button=e.target.closest('[data-action]');if(!button)return;const {action,id}=button.dataset;
  try{
    if(action==='calendar')calendar();
    if(action==='add-guest')editGuest();if(action==='edit-guest')editGuest(id);if(action==='close-dialog')document.getElementById('guest-dialog').close();
    if(action==='export-guests')exportGuests();
    if(action==='export-songs')download('nash-pleylist.txt',playlistEntries().map(g=>`${g.song} — от ${g.name}${g.reason?'\n'+g.reason:''}`).join('\n\n'),'text/plain;charset=utf-8');
    if(action==='copy-code'){await navigator.clipboard.writeText(guestToken);toast('Личный код скопирован. Сохрани его для себя.');}
    if(action==='logout'){await api('logout',{method:'POST',data:{},token:''});isAdmin=false;adminPhotos=[];await refresh();render();}
    if(action==='moderate-photo'){button.disabled=true;await api('admin-photo',{method:'POST',data:{id,hidden:button.dataset.hidden==='true'}});await refresh({admin:true});render();}
    if(action==='remove-photo'){button.disabled=true;await api('photo-remove',{method:'POST',data:{id}});await refresh({own:true});render();}
  }catch(error){button.disabled=false;toast(error.message);}
});
window.addEventListener('hashchange',async()=>{render();window.scrollTo(0,0);main.focus({preventScroll:true});try{await refresh({admin:route()==='admin',own:route()==='rsvp'||route()==='photos'});if(!document.activeElement?.closest('form'))render();}catch(error){loadError=error.message;const box=document.getElementById('connection-status');box.hidden=false;box.textContent=loadError;}});
// Update shared views while leaving any in-progress form untouched.
setInterval(async()=>{if(document.hidden||!['people','photos'].includes(route())||document.activeElement?.closest('form'))return;try{await refresh();if(!document.querySelector('#photo-form input[type=file]')?.files.length)render();}catch{}},30000);
render();boot();
