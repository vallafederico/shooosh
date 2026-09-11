import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {Curves} from './assets';
const a:Curves=JSON.parse(readFileSync('experiment/assets/abel-slug.json','utf8'));
test('prepared curves identify the shipped font exactly',()=>{
 expect(a.sha256).toBe(createHash('sha256').update(readFileSync('experiment/assets/Abel-Regular.ttf')).digest('hex'));
});
test('band lists are in range, sorted and contain every intersecting curve',()=>{
 for(const g of Object.values(a.glyphs)){
  const packed=a.curves[g.row]!,bands=a.bands[g.row]!;
  expect(packed.length%8).toBe(0);expect(packed.length/4).toBeLessThanOrEqual(4096);expect(bands.length).toBeLessThanOrEqual(4096);
  const curves=Array.from({length:packed.length/8},(_,i)=>packed.slice(i*8,i*8+6));
  for(const axis of [1,0])for(let b=0;b<8;b++){
   const [count,offset]=bands[(axis===1?0:8)+b]!;
   const refs=bands.slice(offset!,offset!+count!);expect(refs.length).toBe(count!);
   let last=Infinity;
   for(const [x,row] of refs){expect(row).toBe(g.row);expect(x!%2).toBe(0);const c=curves[x!/2]!;expect(c).toBeDefined();const max=Math.max(...c.filter((_,i)=>i%2===1-axis));expect(max).toBeLessThanOrEqual(last);last=max;}
   const low=g.bounds[axis]!+(g.bounds[axis+2]!-g.bounds[axis]!)*b/8-1/1024;
   const high=g.bounds[axis]!+(g.bounds[axis+2]!-g.bounds[axis]!)*(b+1)/8+1/1024;
   curves.forEach((c,i)=>{const v=c.filter((_,j)=>j%2===axis);if(new Set(v).size>1&&Math.min(...v)<=high&&Math.max(...v)>=low)expect(refs.some(r=>r[0]===2*i)).toBe(true);});
  }
 }
});
test('runtime textures are prepacked and dimensionally valid',()=>{
 const metadata=JSON.parse(readFileSync('experiment/public/text-bench/abel-metadata.json','utf8'));
 expect(metadata.sha256).toBe(a.sha256);
 expect(metadata.rows).toBe(a.curves.length);
 expect(readFileSync('experiment/public/text-bench/abel-curves.bin').length).toBe(metadata.rows*4096*8);
 expect(readFileSync('experiment/public/text-bench/abel-bands.bin').length).toBe(metadata.rows*4096*4);
});
