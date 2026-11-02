const $=id=>document.getElementById(id);
let apiUrl='',session=null,floor=1,markers=[],selected=null,pending=null,placing=false,busy=false;
const DEFAULT_PLAN_SCALE=2.3;
let zoom=1,offset={x:0,y:0},base={w:1,h:1},requestVersion=0,galleryVersion=0;
const objectUrls=new Set();
function text(tag,value,className){const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;}
function message(value=''){$('notice').textContent=value;$('notice').hidden=!value;}
function connected(ok){$('connection').textContent=ok?'● Shared storage connected':'● Storage offline';$('connection').classList.toggle('offline',!ok);}
async function request(route,options={}){
 const headers={...(new URL(apiUrl,location.href).hostname.endsWith('.ngrok-free.dev')?{'ngrok-skip-browser-warning':'1'}:{}),...(session?{Authorization:`Bearer ${session.token}`}:{})};if(options.body)headers['Content-Type']='application/json';
 let res;try{res=await fetch(apiUrl+route,{...options,headers,signal:AbortSignal.timeout(60000)});}catch{connected(false);throw Error('Cannot reach the office service. Check that the office computer and secure connection are running.');}
 if(!res.ok){const data=await res.json().catch(()=>({}));if(res.status===401&&route!=='/login')logout();if(res.status>=500)connected(false);throw Error(data.error||'The request could not be completed.');}
 if(options.binary)return res.blob();return res.json();
}
function logout(){session=null;sessionStorage.removeItem('hub5-session');requestVersion++;galleryVersion++;for(const d of document.querySelectorAll('dialog'))d.close();releaseImages();$('workspace').hidden=true;$('login-screen').hidden=false;$('password').value='';}
function showWorkspace(){
 $('login-screen').hidden=true;$('workspace').hidden=false;const admin=session.role==='admin';$('add-location').hidden=!admin;$('account-name').textContent=admin?'Administrator':'Viewer';$('account-caption').textContent=admin?'Manage site photos':'Read-only access';$('avatar').textContent=admin?'A':'U';
 renderFloors();requestAnimationFrame(fit);loadFloor();
}
function renderFloors(){const list=$('floor-list');list.replaceChildren();for(let n=1;n<=14;n++){const b=document.createElement('button');b.className=n===floor?'active':'';b.setAttribute('aria-current',n===floor?'page':'false');b.append(text('span',String(n).padStart(2,'0'),'floor-index'),text('span',`Floor ${String(n).padStart(2,'0')}`));b.onclick=()=>{if(floor===n)return;floor=n;setPlacement(false);$('floor-number').textContent=String(n).padStart(2,'0');renderFloors();fit();loadFloor();};list.append(b);}}
async function loadFloor(){const version=++requestVersion;markers=[];renderMarkers();$('location-cards').replaceChildren(text('div','Loading photo locations…','empty-state'));try{const data=await request(`/floors/${floor}/markers`);if(version!==requestVersion)return;markers=data.markers;connected(true);message();renderMarkers();}catch(e){if(version!==requestVersion)return;message(e.message);$('location-cards').replaceChildren(text('div','Photos are temporarily unavailable. Use Refresh to try again.','empty-state'));}}
function renderMarkers(){
 $('markers').replaceChildren();$('location-cards').replaceChildren();$('location-count').textContent=markers.length;$('photo-count').textContent=markers.reduce((n,m)=>n+m.photos.length,0);
 markers.forEach((m,i)=>{const b=text('button',i+1,'marker');b.style.left=`${m.x*100}%`;b.style.top=`${m.y*100}%`;b.title=m.title;b.setAttribute('aria-label',`${m.title}, ${m.photos.length} photos`);b.onclick=e=>{e.stopPropagation();openGallery(m);};b.onpointerdown=e=>e.stopPropagation();$('markers').append(b);
 const card=document.createElement('button');card.className='location-card';const info=document.createElement('span');info.append(text('b',m.title),text('small',`${m.photos.length} photo${m.photos.length===1?'':'s'} · ${formatDate(m.createdAt)}`));card.append(text('span',String(i+1).padStart(2,'0'),'location-number'),info,text('span','↗','location-arrow'));card.onclick=()=>openGallery(m);$('location-cards').append(card);});
 if(!markers.length){const empty=text('div','','empty-state');empty.append(text('span','◎','empty-symbol'),text('b','A fresh perspective starts here.'),text('span',session?.role==='admin'?'Add your first photo location on this floor.':'Photo locations will appear here when the admin adds them.'));$('location-cards').append(empty);}
 transform();
}
function formatDate(s){return new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(s));}
function fit(){const v=$('viewport'),img=$('plan-image');if(!v.clientWidth||!img.naturalWidth)return;const scale=Math.min((v.clientWidth-55)/img.naturalWidth,(v.clientHeight-55)/img.naturalHeight)*DEFAULT_PLAN_SCALE;base={w:img.naturalWidth*scale,h:img.naturalHeight*scale};zoom=1;offset={x:(v.clientWidth-base.w)/2,y:(v.clientHeight-base.h)/2};transform();}
function transform(){const s=$('plan-stage');s.style.width=`${base.w}px`;s.style.height=`${base.h}px`;s.style.transform=`translate(${offset.x}px,${offset.y}px) scale(${zoom})`;$('zoom-level').textContent=Math.round(zoom*100)+'%';for(const m of document.querySelectorAll('.marker'))m.style.transform=`translate(-50%,-50%) scale(${1/zoom})`;}
function changeZoom(factor,cx=$('viewport').clientWidth/2,cy=$('viewport').clientHeight/2){const next=Math.max(.5,Math.min(16,zoom*factor));offset.x=cx-(cx-offset.x)*next/zoom;offset.y=cy-(cy-offset.y)*next/zoom;zoom=next;transform();}
function setPlacement(value){placing=value;$('viewport').classList.toggle('placing',value);$('placement-hint').hidden=!value;$('add-location').textContent=value?'Click the plan below':'＋ Add photo location';}
let drag=null;
$('viewport').onpointerdown=e=>{if(e.button!==0||e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y,moved:false};$('viewport').setPointerCapture(e.pointerId);};
$('viewport').onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.moved=true;if(drag.moved){offset={x:drag.ox+dx,y:drag.oy+dy};$('viewport').classList.add('dragging');transform();}};
$('viewport').onpointerup=e=>{if(!drag)return;const moved=drag.moved;drag=null;$('viewport').classList.remove('dragging');if(placing&&!moved){const rect=$('plan-stage').getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height;if(x>=0&&x<=1&&y>=0&&y<=1){pending={x,y,floor};selected=null;openUpload();setPlacement(false);}}};
$('viewport').onpointercancel=()=>{drag=null;$('viewport').classList.remove('dragging');};
$('viewport').addEventListener('wheel',e=>{e.preventDefault();const rect=$('viewport').getBoundingClientRect();changeZoom(Math.exp(-e.deltaY*.001),e.clientX-rect.left,e.clientY-rect.top);},{passive:false});
$('zoom-in').onclick=()=>changeZoom(1.25);$('zoom-out').onclick=()=>changeZoom(.8);$('reset').onclick=fit;$('plan-image').onload=fit;
$('plan-image').onerror=()=>message('The floor plan could not be loaded. Check the deployed floor-plan-pdf.svg asset.');
new ResizeObserver(()=>{if(!$('workspace').hidden)fit();}).observe($('viewport'));
$('add-location').onclick=()=>setPlacement(!placing);$('cancel-place').onclick=()=>setPlacement(false);$('refresh').onclick=loadFloor;$('logout').onclick=logout;
// Mobile sign-out remains accessible when the desktop sidebar is collapsed.
const mobileLogout=text('button','Sign out');mobileLogout.style.fontSize='10px';mobileLogout.onclick=logout;$('connection').parentNode.append(mobileLogout);
function releaseImages(){for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls.clear();}
async function openGallery(marker){
 selected={...marker,floor};const version=++galleryVersion;releaseImages();$('gallery-title').textContent=marker.title;$('gallery-floor').textContent=`FLOOR ${String(floor).padStart(2,'0')} / ${marker.photos.length} PHOTOS`;$('gallery-error').textContent='';$('gallery-actions').hidden=session.role!=='admin';$('gallery-photos').replaceChildren();$('gallery').showModal();
 const thisFloor=floor;
 for(const p of marker.photos){const figure=document.createElement('figure');figure.className='photo-item';const loading=text('div','Loading photo…','empty-state');figure.append(loading);const caption=document.createElement('figcaption');caption.className='photo-caption';const label=text('span',p.name);label.append(text('small',formatDate(p.createdAt)));caption.append(label);
 if(session.role==='admin'){const del=text('button','Delete photo','danger');del.onclick=()=>removePhoto(marker,p,thisFloor,del);caption.append(del);}figure.append(caption);$('gallery-photos').append(figure);
 request(`/floors/${thisFloor}/markers/${marker.id}/photos/${p.file}`,{binary:true}).then(blob=>{if(version!==galleryVersion||!$('gallery').open)return;const url=URL.createObjectURL(blob);objectUrls.add(url);const img=document.createElement('img');img.src=url;img.alt=p.name;const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.className='photo-open';link.title='Open full-size photo';link.setAttribute('aria-label',`Open ${p.name} full size in a new tab`);link.append(img);loading.replaceWith(link);}).catch(e=>{if(version===galleryVersion)loading.textContent=e.message;});
 }
}
async function removePhoto(marker,photo,thisFloor,button){if(!confirm('Delete this photo? This cannot be undone.'))return;button.disabled=true;try{await request(`/floors/${thisFloor}/markers/${marker.id}/photos/${photo.file}`,{method:'DELETE'});$('gallery').close();await loadFloor();const updated=markers.find(m=>m.id===marker.id);if(updated)openGallery(updated);}catch(e){$('gallery-error').textContent=e.message;button.disabled=false;}}
$('gallery').addEventListener('close',()=>{galleryVersion++;releaseImages();});
$('delete-location').onclick=async()=>{if(!selected||!confirm('Delete this location and all its photos? This cannot be undone.'))return;const button=$('delete-location');button.disabled=true;try{await request(`/floors/${selected.floor}/markers/${selected.id}`,{method:'DELETE'});$('gallery').close();await loadFloor();}catch(e){$('gallery-error').textContent=e.message;}finally{button.disabled=false;}};
function openUpload(){if(session.role!=='admin')return;$('upload-form').reset();$('selected-files').replaceChildren();$('upload-error').textContent='';$('title-field').hidden=!!selected;$('upload-title').textContent=selected?'Add photos':'New photo location';$('upload-floor').textContent=`FLOOR ${String(selected?.floor||pending.floor).padStart(2,'0')}`;$('upload-dialog').showModal();}
$('add-photos').onclick=()=>{$('gallery').close();openUpload();};
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>{if(!busy)b.closest('dialog').close();});
$('upload-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('photo-input').onchange=()=>{$('selected-files').replaceChildren(...Array.from($('photo-input').files).map(f=>text('div',`${f.name} · ${(f.size/1024/1024).toFixed(1)} MB`)));};
function readFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,data:reader.result.split(',')[1]});reader.onerror=()=>reject(Error('Could not read '+file.name));reader.readAsDataURL(file);});}
$('upload-form').onsubmit=async e=>{
 e.preventDefault();if(busy)return;const files=Array.from($('photo-input').files);$('upload-error').textContent='';
 if(!files.length||files.length>10||files.some(f=>f.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type))||files.reduce((s,f)=>s+f.size,0)>12*1024*1024){$('upload-error').textContent='Choose 1–10 JPG, PNG or WebP photos, under 8 MB each and 12 MB in total.';return;}
 busy=true;$('save-upload').disabled=true;$('save-upload').textContent='Saving photos…';
 try{const photos=await Promise.all(files.map(readFile));const target=selected||pending;const route=`/floors/${target.floor}/markers${selected?'/'+selected.id:''}`;await request(route,{method:'POST',body:JSON.stringify({photos,x:target.x,y:target.y,title:$('location-title').value.trim()||'Photo location'})});$('upload-dialog').close();await loadFloor();}
 catch(e){$('upload-error').textContent=e.message;}finally{busy=false;$('save-upload').disabled=false;$('save-upload').textContent='Save photos ↗';}
};
$('login-form').onsubmit=async e=>{e.preventDefault();$('login-error').textContent='';$('sign-in').disabled=true;try{if(!apiUrl)await config();session=await request('/login',{method:'POST',body:JSON.stringify({username:$('username').value.trim().toLowerCase(),password:$('password').value})});sessionStorage.setItem('hub5-session',JSON.stringify(session));$('password').value='';showWorkspace();}catch(e){$('login-error').textContent=e.message;}finally{$('sign-in').disabled=false;}};
async function config(){const res=await fetch('/api/config');const data=await res.json();if(!res.ok)throw Error(data.error||'The office service address has not been configured.');const url=new URL(data.apiUrl);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Office service requires an HTTPS address.');apiUrl=data.apiUrl.replace(/\/$/,'');}
try{await config();try{session=JSON.parse(sessionStorage.getItem('hub5-session'));}catch{sessionStorage.removeItem('hub5-session');}if(session?.token&&['admin','user'].includes(session.role)){await request('/status');showWorkspace();}}catch(e){$('login-error').textContent=e.message;}
