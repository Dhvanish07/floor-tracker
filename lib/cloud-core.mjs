import supabaseCA from './supabase-ca.mjs';
import {Pool} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {createHmac, timingSafeEqual, scryptSync} from 'node:crypto';
export const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'hub5-photos';
let db, supabase;
export function database() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString || connectionString === '[SENSITIVE]') throw Error('Configure POSTGRES_URL');
  const url=new URL(connectionString);
  for(const key of ['sslmode','sslrootcert','sslcert','sslkey']) url.searchParams.delete(key);
  return db ||= new Pool({connectionString:url.toString(), ssl:{ca:supabaseCA,rejectUnauthorized:true}, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 15000});
}
export function storage() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_SECRET_KEY !== '[SENSITIVE]' ? process.env.SUPABASE_SECRET_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.startsWith('https://') || !key || key === '[SENSITIVE]') throw Error('Configure Supabase URL and server key');
  supabase ||= createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}});
  return supabase.storage.from(bucket);
}
export function fail(status, message) {return Object.assign(Error(message), {status});}
function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw Error('Configure SESSION_SECRET');
  return process.env.SESSION_SECRET;
}
export function sign(value) {return createHmac('sha256', secret()).update(value).digest('base64url');}
export function equal(a, b) {
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
}
export function issue(role) {
  const data=Buffer.from(JSON.stringify({role,exp:Date.now()+8*3600000})).toString('base64url');
  return data+'.'+sign(data);
}
export function authorize(req) {
  const [data, signature, extra]=(req.headers.get('authorization')||'').replace(/^Bearer /,'').split('.');
  if(!data || !signature || extra || !equal(sign(data),signature)) throw fail(401,'Please sign in again.');
  let user; try {user=JSON.parse(Buffer.from(data,'base64url'));} catch {throw fail(401,'Please sign in again.');}
  if(!Number.isFinite(user.exp) || user.exp<Date.now() || !['admin','user'].includes(user.role)) throw fail(401,'Session expired. Please sign in again.');
  return user;
}
export function checkPassword(username,password) {
  const configured={admin:process.env.ADMIN_PASSWORD,user:process.env.USER_PASSWORD};
  if(!configured.admin || !configured.user) throw Error('Configure account passwords');
  if(typeof username!=='string' || !Object.hasOwn(configured,username) || typeof password!=='string' || password.length>1024) return false;
  return timingSafeEqual(scryptSync(password,secret(),64),scryptSync(configured[username],secret(),64));
}
export function imageType(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255) return 'image/jpeg';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP') return 'image/webp';
  return null;
}
export function marker(row) {
  return {id:row.id,x:row.x,y:row.y,title:row.title,createdAt:new Date(row.created_at).toISOString(),photos:row.photos};
}
