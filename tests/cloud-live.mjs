import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base=process.env.TEST_BASE_URL||'http://localhost:3001';
async function api(path,token,method='GET',body) {
  const response=await fetch(base+'/api'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();return {response,data};
}
const admin=await api('/login',null,'POST',{username:'admin',password:process.env.ADMIN_PASSWORD});
assert.equal(admin.response.status,200,'Admin login');
const viewer=await api('/login',null,'POST',{username:'user',password:process.env.USER_PASSWORD});
assert.equal(viewer.response.status,200,'Viewer login');
const a=admin.data.token,v=viewer.data.token;
assert.equal((await api('/status',v)).response.status,200,'Storage status');
assert.equal((await api('/floors/14/markers',null)).response.status,401);
assert.equal((await api('/floors/14/markers',v,'POST',{})).response.status,403);
// A PNG with trailing padding exercises direct uploads above Vercel's 4.5 MB payload limit.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const image=Buffer.concat([png,Buffer.alloc(5*1024*1024)]);
let markerId;
try {
  const begun=await api('/floors/14/markers',a,'POST',{x:.25,y:.4,title:'HUB5 verification (temporary)',photos:[{name:'verification.png',type:'image/png',size:image.length}]});
  assert.equal(begun.response.status,201,'Begin upload');
  const upload=await fetch(begun.data.uploads[0].url,{method:'PUT',headers:{'Content-Type':'image/png','x-upsert':'false'},body:image});
  assert.equal(upload.ok,true,'Direct signed upload');
  const done=await api('/uploads/complete',a,'POST',{uploadId:begun.data.uploadId});
  assert.equal(done.response.status,201,'Finalize upload');markerId=done.data.marker.id;
  assert.equal((await api('/uploads/complete',a,'POST',{uploadId:begun.data.uploadId})).response.status,409,'Replay protection');
  const photo=done.data.marker.photos[0];
  const signed=await api(`/floors/14/markers/${markerId}/photos/${photo.file}`,v);
  assert.equal(signed.response.status,200,'Viewer photo access');
  const downloaded=Buffer.from(await (await fetch(signed.data.url)).arrayBuffer());
  const hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(downloaded),hash(image),'Photo checksum');
  assert.equal((await api(`/floors/13/markers/${markerId}/photos/${photo.file}`,v)).response.status,404,'Floor isolation');
  assert.equal((await api(`/floors/14/markers/${markerId}`,v,'DELETE')).response.status,403,'Viewer delete denied');
  console.log('Cloud integration passed: login, private storage, 5 MB upload, finalize replay protection, viewer permissions, floor isolation, and photo checksum.');
} finally {
  if(markerId) {
    const removed=await api(`/floors/14/markers/${markerId}`,a,'DELETE');
    assert.equal(removed.response.status,200,'Test record cleanup');
    console.log('Temporary verification marker and photo deleted.');
  }
}
