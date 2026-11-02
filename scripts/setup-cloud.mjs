import fs from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {database,bucket} from '../lib/cloud-core.mjs';
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_SECRET_KEY!=='[SENSITIVE]'?process.env.SUPABASE_SECRET_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url?.startsWith('https://')||!key||key==='[SENSITIVE]') throw Error('Set the real Supabase URL and server key in .env.cloud.local');
const client=createClient(url,key,{auth:{persistSession:false}});
try {
  await database().query(await fs.readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  const {data,error}=await client.storage.getBucket(bucket);
  if(data?.public) throw Error('The photo bucket must be private; refusing to use a public bucket.');
  if(error) {
    const result=await client.storage.createBucket(bucket,{public:false,fileSizeLimit:8*1024*1024,allowedMimeTypes:['image/jpeg','image/png','image/webp']});
    if(result.error) throw Error('Could not create private storage bucket: '+result.error.message);
  }
  console.log('Cloud tables and private photo bucket are ready.');
} finally {await database().end();}
