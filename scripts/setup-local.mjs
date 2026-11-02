import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
await fs.mkdir('local-storage',{recursive:true});
const admin=randomBytes(9).toString('base64url'),user=randomBytes(9).toString('base64url');
const content=`STORAGE_ROOT=${JSON.stringify(path.resolve('local-storage').replaceAll('\\','/'))}\nAPP_ORIGIN=http://localhost:3000\nADMIN_PASSWORD=${admin}\nUSER_PASSWORD=${user}\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nPORT=8787\nHOST=127.0.0.1\nOFFICE_API_URL=http://localhost:8787\n`;
try{await fs.writeFile('.env',content,{flag:'wx'});console.log('Local configuration created. Passwords are in .env (not committed).');}catch(e){if(e.code==='EEXIST')console.log('Existing .env preserved.');else throw e;}
