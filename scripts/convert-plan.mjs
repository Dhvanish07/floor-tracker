import fs from 'node:fs/promises';
import {LibreDwg,Dwg_File_Type} from '@mlightcad/libredwg-web';
const lib = await LibreDwg.create('./node_modules/@mlightcad/libredwg-web/wasm/');
const bytes = await fs.readFile('source/floor-plan.dwg');
const ptr = lib.dwg_read_data(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),Dwg_File_Type.DWG);
if (!ptr) throw Error('DWG could not be read');
const db = lib.convert(ptr);
await fs.writeFile('source/plan-data.json',JSON.stringify(db,(_,v)=>typeof v==='bigint'?v.toString():v));
// Use the DWG's model extents: the converter overestimates text bounds at
// this drawing's large survey coordinates. Preserve a margin around the plan.
const min=db.header.EXTMIN,max=db.header.EXTMAX;
const width=max.x-min.x,height=max.y-min.y,pad=2000;
let svg=lib.dwg_to_svg(db).replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi,'&amp;');
svg=svg.replace(/viewBox="[^"]+"/,`viewBox="${min.x-pad} ${-max.y-pad} ${width+pad*2} ${height+pad*2}"`)
 .replace('width="100%" height="100%"',`width="${width+pad*2}" height="${height+pad*2}"`)
 .replace('stroke-width="0.1%"','stroke-width="0.7"')
 .replace(/<(path|line|circle|ellipse|polyline|polygon)\b/g,'<$1 vector-effect="non-scaling-stroke"')
 .replace(/<text\b/g,'<text stroke="none"')
 .replace(/rgb\(255,255,255\)/g,'#33483f')
 .replace(/rgb\(255,255,0\)/g,'#697c54')
 .replace(/rgb\(0,255,255\)/g,'#628a92')
 .replace(/rgb\(0,255,0\)/g,'#65855e')
 .replace(/rgb\(255,0,255\)/g,'#8a6c81')
 .replace(/rgb\(255,0,0\)/g,'#a67a65');
await fs.writeFile('public/floor-plan.svg',svg);
lib.dwg_free(ptr);
console.log('Converted floor-plan.svg');

