import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {database,storage,imageType} from '../lib/cloud-core.mjs';
const root=process.env.STORAGE_ROOT;
if(!root) throw Error('Set STORAGE_ROOT to the legacy folder to copy.');
let locations=0,photos=0;
try {
  for(let floor=1;floor<=14;floor++) {
    const dir=path.join(root,`floor-${String(floor).padStart(2,'0')}`);
    let rows;
    try {rows=JSON.parse(await fs.readFile(path.join(dir,'markers.json'),'utf8'));} catch(e) {if(e.code==='ENOENT')continue;throw e;}
    for(const marker of rows) {
      if(!/^[a-f0-9-]{36}$/.test(marker.id)||!Number.isFinite(marker.x)||!Number.isFinite(marker.y)) throw Error('Invalid legacy marker.');
      const existing=await database().query('select photos from hub5_markers where id=$1',[marker.id]);
      if(existing.rowCount) {console.log(`Floor ${floor}: marker already migrated; skipped.`);continue;}
      const migrated=[];
      for(const photo of marker.photos) {
        if(!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(photo.file)) throw Error('Invalid legacy photo path.');
        const bytes=await fs.readFile(path.join(dir,photo.file));
        if(imageType(bytes)!==photo.type||bytes.length>8*1024*1024) throw Error('Invalid legacy photo.');
        const objectPath=`floor-${String(floor).padStart(2,'0')}/${marker.id}/${photo.file}`;
        const result=await storage().upload(objectPath,bytes,{contentType:photo.type,upsert:false});
        if(result.error && !['409','400'].includes(String(result.error.statusCode))) throw Error('Photo copy failed.');
        // Verify downloaded bytes even when resuming a partial migration.
        const {data,error}=await storage().download(objectPath);
        if(error) throw Error('Could not verify copied photo.');
        const digest=b=>createHash('sha256').update(b).digest('hex');
        if(digest(bytes)!==digest(Buffer.from(await data.arrayBuffer()))) throw Error('Copied photo checksum does not match.');
        migrated.push({...photo,path:objectPath,size:bytes.length});photos++;
      }
      await database().query('insert into hub5_markers(id,floor,x,y,title,created_at,photos) values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do nothing',[marker.id,floor,marker.x,marker.y,marker.title,marker.createdAt,JSON.stringify(migrated)]);
      locations++;
    }
  }
  console.log(`Migration verified: ${locations} locations, ${photos} photos copied. Original files were not changed.`);
} finally {await database().end();}
