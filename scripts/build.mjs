import fs from 'node:fs/promises';
for(const file of ['index.html','app.js','style.css','floor-plan-pdf.svg'])await fs.access('public/'+file);
const svg=await fs.readFile('public/floor-plan-pdf.svg','utf8');
if(!svg.includes('<svg')||svg.includes('NaN'))throw Error('Invalid floor plan SVG');
console.log('Vercel assets ready in public/. Office service deploys separately.');
