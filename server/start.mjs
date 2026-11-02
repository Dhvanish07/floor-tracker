import {createService} from './service.mjs';
const server=createService({root:process.env.STORAGE_ROOT,secret:process.env.SESSION_SECRET,adminPassword:process.env.ADMIN_PASSWORD,userPassword:process.env.USER_PASSWORD,origin:process.env.APP_ORIGIN});
server.listen(Number(process.env.PORT||8787),process.env.HOST||'127.0.0.1',()=>console.log(`Office service listening on ${process.env.HOST||'127.0.0.1'}:${process.env.PORT||8787}`));
