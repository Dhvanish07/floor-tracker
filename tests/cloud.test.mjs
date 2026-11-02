import {test} from 'node:test';
import assert from 'node:assert/strict';
import {issue,authorize,imageType} from '../lib/cloud-core.mjs';
import {handle,validateFiles} from '../lib/cloud.mjs';
process.env.SESSION_SECRET='cloud-test-secret-at-least-thirty-two-characters';
const request=(path,method,token)=>new Request('https://hub5.test/api'+path,{method,headers:token?{Authorization:'Bearer '+token}:{}});
test('cloud authorization rejects tampered tokens and viewer mutations before storage access',async()=>{
  const token=issue('user');
  assert.equal(authorize(request('/status','GET',token)).role,'user');
  assert.throws(()=>authorize(request('/status','GET',token+'x')),e=>e.status===401);
  assert.equal((await handle(request('/floors/1/markers','GET'))).status,401);
  for(const [path,method] of [['/floors/1/markers','POST'],['/uploads/complete','POST'],['/floors/1/markers/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','DELETE']]) {
    assert.equal((await handle(request(path,method,token))).status,403);
  }
});
test('upload limits reject oversized totals, invalid types, and empty batches',()=>{
  assert.throws(()=>validateFiles([]));
  assert.throws(()=>validateFiles([null]),e=>e.status===400);
  assert.throws(()=>validateFiles([{type:'text/html',size:100}]));
  assert.throws(()=>validateFiles([{type:'image/png',size:9*1024*1024}]));
  assert.throws(()=>validateFiles(Array(2).fill({type:'image/png',size:7*1024*1024})));
  validateFiles([{type:'image/png',size:8*1024*1024}]);
  assert.equal(imageType(Buffer.from('not an image')),null);
  assert.equal(imageType(Buffer.from([137,80,78,71,13,10,26,10])),'image/png');
});
