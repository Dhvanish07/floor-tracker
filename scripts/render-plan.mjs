import fs from 'node:fs/promises';
import {Resvg} from '@resvg/resvg-js';
const svg=await fs.readFile('public/floor-plan-pdf.svg','utf8');
await fs.writeFile('source/plan-preview.png',new Resvg(svg,{fitTo:{mode:'width',value:1800},background:'white'}).render().asPng());
