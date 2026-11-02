import {database,storage} from '../lib/cloud-core.mjs';
try {
  const {rows}=await database().query("select id,photos from hub5_uploads where expires_at < now()-interval '2 hours'");
  let removed=0;
  for(const row of rows) {
    const {error}=await storage().remove(row.photos.map(p=>p.path));
    if(error) throw Error('Could not clean up expired uploads.');
    await database().query('delete from hub5_uploads where id=$1',[row.id]);removed++;
  }
  await database().query('delete from hub5_login_attempts where expires_at<now()');
  console.log(`Removed ${removed} expired upload batches.`);
} finally {await database().end();}
