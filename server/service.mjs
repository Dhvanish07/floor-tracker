import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHmac,timingSafeEqual,scryptSync} from 'node:crypto';
const fail=(status,message)=>Object.assign(Error(message),{status});
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>18*1024*1024)throw fail(413,'Upload is too large. Use photos under 12 MB in total.');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail(400,'Invalid JSON');}}
export function createService(config){
 const {root,secret,adminPassword,userPassword,origin}=config;
 if(!root||!secret||secret.length<32||!adminPassword||!userPassword||!origin)throw Error('Configure STORAGE_ROOT, SESSION_SECRET (32+ characters), both passwords and APP_ORIGIN.');
 const sign=s=>createHmac('sha256',secret).update(s).digest('base64url');
 const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
 const hashes={admin:scryptSync(adminPassword,secret,64),user:scryptSync(userPassword,secret,64)};
 const issue=role=>{const p=Buffer.from(JSON.stringify({role,exp:Date.now()+8*3600000})).toString('base64url');return p+'.'+sign(p);};
 const authorize=req=>{const [p,s,...extra]=(req.headers.authorization||'').replace(/^Bearer /,'').split('.');if(!p||!s||extra.length||!equal(sign(p),s))throw fail(401,'Please sign in again.');let user;try{user=JSON.parse(Buffer.from(p,'base64url'));}catch{throw fail(401,'Invalid session');}if(user.exp<Date.now()||!['admin','user'].includes(user.role))throw fail(401,'Session expired');return user;};
 const folder=f=>path.join(root,`floor-${String(f).padStart(2,'0')}`);
 async function read(f){try{return JSON.parse(await fs.readFile(path.join(folder(f),'markers.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
 async function write(f,data){await fs.mkdir(folder(f),{recursive:true});const tmp=path.join(folder(f),`markers-${randomUUID()}.tmp`);await fs.writeFile(tmp,JSON.stringify(data,null,2));await fs.rename(tmp,path.join(folder(f),'markers.json'));}
 let queue=Promise.resolve();
 const mutate=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 const attempts=new Map();
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers.origin){if(req.headers.origin!==origin)return json(res,403,{error:'This website is not allowed.'});res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/login'&&req.method==='POST'){
    const key=req.socket.remoteAddress,now=Date.now();
    for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
    const limit=attempts.get(key)||{count:0,until:now+15*60000};
    if(limit.count>=20)throw fail(429,'Too many sign-in attempts. Try again in 15 minutes.');
    const data=await body(req);limit.count++;attempts.set(key,limit);
    if(typeof data.password!=='string'||data.password.length>1024||!Object.hasOwn(hashes,data.username)||!timingSafeEqual(scryptSync(data.password,secret,64),hashes[data.username]))throw fail(401,'Incorrect username or password.');
    attempts.delete(key);return json(res,200,{token:issue(data.username),role:data.username});
   }
   const user=authorize(req);
   // Do not silently create a missing network share or substitute local storage.
   const stat=await fs.stat(root);if(!stat.isDirectory())throw Error('Storage root is not a directory');
   if(url.pathname==='/status'&&req.method==='GET')return json(res,200,{connected:true,role:user.role});
   const match=url.pathname.match(/^\/floors\/(\d+)(?:\/(markers)(?:\/([a-f0-9-]+))?(?:\/(photos)(?:\/([a-f0-9-]+\.(?:jpg|png|webp)))?)?)?$/);
   if(!match)throw fail(404,'Not found');
   const floor=Number(match[1]),id=match[3],photo=match[5];if(floor<1||floor>14)throw fail(400,'Invalid floor');
   if(req.method==='GET'&&!id)return json(res,200,{markers:await read(floor)});
   if(req.method==='GET'&&id&&photo){const markers=await read(floor);const item=markers.find(m=>m.id===id)?.photos.find(p=>p.file===photo);if(!item)throw fail(404,'Photo not found');const bytes=await fs.readFile(path.join(folder(floor),photo));res.writeHead(200,{'Content-Type':item.type,'Cache-Control':'private, max-age=300'});return res.end(bytes);}
   if(user.role!=='admin')throw fail(403,'Only the admin can change photos.');
   if(req.method==='POST'&&match[2]==='markers'&&!photo){
    const data=await body(req);
    if(!Array.isArray(data.photos)||data.photos.length<1||data.photos.length>10)throw fail(400,'Choose 1–10 photos.');
    if(!id&&(!Number.isFinite(data.x)||!Number.isFinite(data.y)||data.x<0||data.x>1||data.y<0||data.y>1))throw fail(400,'Choose a point on the plan.');
    const incoming=data.photos.map(p=>{
     if(typeof p.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.data))throw fail(400,'Invalid image');
     const bytes=Buffer.from(p.data,'base64');
     const type=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
     if(!type||bytes.length>8*1024*1024)throw fail(400,'Use JPG, PNG or WebP photos under 8 MB each.');
     return {bytes,meta:{file:randomUUID()+'.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[type]),name:String(p.name||'Photo').slice(0,160),type,createdAt:new Date().toISOString()}};
    });
    if(incoming.reduce((n,p)=>n+p.bytes.length,0)>12*1024*1024)throw fail(413,'Select at most 12 MB of photos per upload.');
    return await mutate(async()=>{
     const markers=await read(floor);let marker=id?markers.find(m=>m.id===id):null;
     if(id&&!marker)throw fail(404,'Location no longer exists.');
     if(!marker){marker={id:randomUUID(),x:data.x,y:data.y,title:String(data.title||'Photo location').trim().slice(0,100),createdAt:new Date().toISOString(),photos:[]};markers.push(marker);}
     await fs.mkdir(folder(floor),{recursive:true});
     const written=[];
     try{for(const p of incoming){await fs.writeFile(path.join(folder(floor),p.meta.file),p.bytes,{flag:'wx'});written.push(p.meta.file);marker.photos.push(p.meta);}await write(floor,markers);}
     catch(e){await Promise.all(written.map(p=>fs.unlink(path.join(folder(floor),p)).catch(()=>{})));throw e;}
     return json(res,201,{marker});
    });
   }
   if(req.method==='DELETE'&&id)return await mutate(async()=>{
    let markers=await read(floor);const marker=markers.find(m=>m.id===id);if(!marker)throw fail(404,'Location not found');
    const removed=photo?marker.photos.filter(p=>p.file===photo):marker.photos;
    if(photo&&!removed.length)throw fail(404,'Photo not found');
    marker.photos=photo?marker.photos.filter(p=>p.file!==photo):[];
    if(!marker.photos.length)markers=markers.filter(m=>m.id!==id);
    await write(floor,markers);
    // Metadata is committed first; failed cleanup never breaks live photo references.
    await Promise.all(removed.map(p=>fs.unlink(path.join(folder(floor),p.file)).catch(e=>console.error('Photo cleanup:',e.code))));
    return json(res,200,{ok:true});
   });
   throw fail(405,'Method not allowed');
  }catch(e){if(!e.status)console.error('Storage/service error:',e.code||e.message);if(!res.headersSent)json(res,e.status||503,{error:e.status?e.message:'Shared storage is unavailable. Check the office service and network folder.'});else res.end();}
 });
 return server;
}
