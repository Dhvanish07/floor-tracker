import {randomUUID} from 'node:crypto';
import {database,storage,fail,sign,issue,authorize,checkPassword,imageType,marker} from './cloud-core.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
async function body(req) {
  const text=await req.text();
  if(Buffer.byteLength(text)>65536) throw fail(413,'Request is too large. Upload photos directly to storage.');
  try{return JSON.parse(text);}catch{throw fail(400,'Invalid JSON.');}
}
function checked(result) {if(result.error) throw Error('Cloud storage operation failed');return result.data;}
export function validateFiles(files) {
  if(!Array.isArray(files)||files.length<1||files.length>10) throw fail(400,'Choose 1–10 photos.');
  if(files.some(p=>!p||typeof p!=='object'||!Object.hasOwn(types,p.type)||!Number.isSafeInteger(p.size)||p.size<1||p.size>8*1024*1024)||files.reduce((n,p)=>n+p.size,0)>12*1024*1024) throw fail(400,'Use JPG, PNG or WebP photos under 8 MB each and 12 MB total.');
}
async function beginUpload(req,floor,id) {
  const data=await body(req);validateFiles(data.photos);
  if(id) {
    if(!(await database().query('select id from hub5_markers where floor=$1 and id=$2',[floor,id])).rowCount) throw fail(404,'Location no longer exists.');
  } else if(!Number.isFinite(data.x)||!Number.isFinite(data.y)||data.x<0||data.x>1||data.y<0||data.y>1) throw fail(400,'Choose a point on the plan.');
  const uploadId=randomUUID(), markerId=id||randomUUID();
  const photos=data.photos.map(p=>{const file=randomUUID()+'.'+types[p.type];return {file,path:`floor-${String(floor).padStart(2,'0')}/${markerId}/${file}`,name:String(p.name||'Photo').slice(0,160),type:p.type,size:p.size,createdAt:new Date().toISOString()};});
  const uploads=[];
  for(const p of photos) {
    const signed=checked(await storage().createSignedUploadUrl(p.path));
    uploads.push({url:signed.signedUrl,type:p.type});
  }
  await database().query('insert into hub5_uploads(id,floor,marker_id,existing,x,y,title,photos) values($1,$2,$3,$4,$5,$6,$7,$8)',[uploadId,floor,markerId,!!id,id?null:data.x,id?null:data.y,String(data.title||'Photo location').trim().slice(0,100),JSON.stringify(photos)]);
  return json({uploadId,uploads},201);
}
async function finishUpload(req) {
  const {uploadId}=await body(req);
  if(!/^[a-f0-9-]{36}$/.test(uploadId||'')) throw fail(400,'Invalid upload.');
  const client=await database().connect();
  try {
    await client.query('begin');
    const {rows:[batch]}=await client.query('select * from hub5_uploads where id=$1 and expires_at>now() for update',[uploadId]);
    if(!batch) throw fail(409,'Upload expired or already saved. Refresh the floor before retrying.');
    // Validate actual stored bytes, not just browser-supplied metadata.
    for(const p of batch.photos) {
      const blob=checked(await storage().download(p.path));
      if(blob.size!==p.size||blob.size>8*1024*1024||imageType(Buffer.from(await blob.arrayBuffer()))!==p.type) throw fail(400,'An uploaded image is invalid. Choose a valid JPG, PNG or WebP photo.');
    }
    let result;
    if(batch.existing) {
      result=await client.query('update hub5_markers set photos=photos || $1::jsonb where id=$2 and floor=$3 returning *',[JSON.stringify(batch.photos),batch.marker_id,batch.floor]);
      if(!result.rowCount) throw fail(404,'Location no longer exists.');
    } else result=await client.query('insert into hub5_markers(id,floor,x,y,title,photos) values($1,$2,$3,$4,$5,$6) returning *',[batch.marker_id,batch.floor,batch.x,batch.y,batch.title,JSON.stringify(batch.photos)]);
    await client.query('delete from hub5_uploads where id=$1',[uploadId]);
    await client.query('commit');
    return json({marker:marker(result.rows[0])},201);
  } catch(e) {await client.query('rollback');throw e;} finally {client.release();}
}
async function deletePhoto(floor,id,file) {
  const client=await database().connect();let removed;
  try {
    await client.query('begin');
    const {rows:[row]}=await client.query('select * from hub5_markers where floor=$1 and id=$2 for update',[floor,id]);
    if(!row) throw fail(404,'Location not found.');
    removed=file?row.photos.filter(p=>p.file===file):row.photos;
    if(file&&!removed.length) throw fail(404,'Photo not found.');
    const remaining=file?row.photos.filter(p=>p.file!==file):[];
    if(remaining.length) await client.query('update hub5_markers set photos=$1 where id=$2',[JSON.stringify(remaining),id]);
    else await client.query('delete from hub5_markers where id=$1',[id]);
    await client.query('commit');
  } catch(e) {await client.query('rollback');throw e;} finally {client.release();}
  if(removed.length) {
    const {error}=await storage().remove(removed.map(p=>p.path));
    if(error) console.error('Storage cleanup deferred for deleted photos.');
  }
  return json({ok:true});
}
export async function handle(req) {
  try {
    const route=new URL(req.url).pathname.replace(/^\/api/,'');
    if(route==='/config'&&req.method==='GET') return json({apiUrl:'/api'});
    if(route==='/login'&&req.method==='POST') {
      const data=await body(req);
      // Shared database counter works across Vercel function instances.
      const ip=(req.headers.get('x-vercel-forwarded-for')||req.headers.get('x-forwarded-for')||'local').split(',')[0].trim();
      const key=sign('login:'+ip);
      const {rows:[limit]}=await database().query(`insert into hub5_login_attempts(key) values($1)
        on conflict(key) do update set attempts=case when hub5_login_attempts.expires_at<now() then 1 else hub5_login_attempts.attempts+1 end,
        expires_at=case when hub5_login_attempts.expires_at<now() then now()+interval '15 minutes' else hub5_login_attempts.expires_at end returning attempts`,[key]);
      if(limit.attempts>20) throw fail(429,'Too many sign-in attempts. Try again in 15 minutes.');
      if(!checkPassword(data.username,data.password)) throw fail(401,'Incorrect username or password.');
      await database().query('delete from hub5_login_attempts where key=$1',[key]);
      return json({token:issue(data.username),role:data.username});
    }
    const user=authorize(req);
    if(route==='/status'&&req.method==='GET') {
      await database().query('select id from hub5_markers limit 1');
      checked(await storage().list('',{limit:1}));
      return json({connected:true,role:user.role});
    }
    if(route==='/uploads/complete'&&req.method==='POST') {
      if(user.role!=='admin') throw fail(403,'Only the admin can change photos.');
      return await finishUpload(req);
    }
    const match=route.match(/^\/floors\/(\d+)\/markers(?:\/([a-f0-9-]{36}))?(?:\/photos\/([a-f0-9-]{36}\.(?:jpg|png|webp)))?$/);
    if(!match) throw fail(404,'Not found.');
    const floor=Number(match[1]),id=match[2],file=match[3];
    if(floor<1||floor>14) throw fail(400,'Invalid floor.');
    if(req.method==='GET'&&!id) {
      const {rows}=await database().query('select * from hub5_markers where floor=$1 order by created_at,id',[floor]);
      return json({markers:rows.map(marker)});
    }
    if(req.method==='GET'&&id&&file) {
      const {rows:[row]}=await database().query('select photos from hub5_markers where floor=$1 and id=$2',[floor,id]);
      const photo=row?.photos.find(p=>p.file===file);
      if(!photo) throw fail(404,'Photo not found.');
      const signed=checked(await storage().createSignedUrl(photo.path,300));
      return json({url:signed.signedUrl});
    }
    if(user.role!=='admin') throw fail(403,'Only the admin can change photos.');
    if(req.method==='POST'&&!file) return await beginUpload(req,floor,id);
    if(req.method==='DELETE'&&id) return await deletePhoto(floor,id,file);
    throw fail(405,'Method not allowed.');
  } catch(e) {
    if(!e.status) console.error('Cloud request failed:',e.code||e.name);
    return json({error:e.status?e.message:'Cloud storage is unavailable. Check the Supabase configuration.'},e.status||503);
  }
}
