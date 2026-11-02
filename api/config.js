export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const api=process.env.OFFICE_API_URL||'';
 if(!api.startsWith('https://'))return res.status(503).json({error:'Set OFFICE_API_URL to the HTTPS address of your office service in Vercel.'});
 res.status(200).json({apiUrl:api.replace(/\/$/,'')});
}
