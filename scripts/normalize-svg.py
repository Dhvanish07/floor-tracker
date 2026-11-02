"""Expand CAD blocks and normalize pen widths across differently scaled inserts."""
import xml.etree.ElementTree as ET
import re, math, copy
from pathlib import Path
ET.register_namespace('', 'http://www.w3.org/2000/svg')
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
p=Path('public/floor-plan.svg')
root=ET.fromstring(p.read_text(encoding='utf-8'))
ids={el.get('id'):el for el in root.iter() if el.get('id')}
ns='{http://www.w3.org/2000/svg}'
def scale_of(s):
    result=1
    for op,args in re.findall(r'(\w+)\(([^)]+)\)',s):
        v=[float(x) for x in re.findall(r'[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?',args)]
        if op=='scale':result*=math.sqrt(abs(v[0]*(v[1] if len(v)>1 else v[0])))
        if op=='matrix':result*=math.sqrt(abs(v[0]*v[3]-v[1]*v[2]))
    return result
def expand(el,scale=1,depth=0):
    if depth>100:raise ValueError('Recursive CAD block')
    scale*=scale_of(el.get('transform',''))
    for child in list(el):
        if child.tag==ns+'defs':el.remove(child);continue
        if child.tag==ns+'use':
            ref=child.get('{http://www.w3.org/1999/xlink}href',child.get('href','')).lstrip('#')
            if ref not in ids:raise ValueError('Missing block '+ref)
            child.tag=ns+'g'
            child.attrib.pop('{http://www.w3.org/1999/xlink}href',None)
            child.attrib.pop('href',None)
            child.append(copy.deepcopy(ids[ref]))
        expand(child,scale,depth+1)
    el.attrib.pop('id',None)
    el.attrib.pop('vector-effect',None)
    if el.tag in [ns+t for t in ['line','path','circle','ellipse','polyline','polygon']]:
        el.set('stroke-width',str(40/max(scale,1e-12)))
    if el.tag==ns+'text':el.set('stroke','none')
expand(root)
ET.ElementTree(root).write(p,encoding='unicode',xml_declaration=True)

