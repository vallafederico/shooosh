import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
// Execute the scalar expression from each real shader, rather than a copied formula.
for(const file of ['msdf-glyphs.ts','gpu-msdf-glyphs.ts']){
 test(`${file}: RGB median is invariant to channel order, including red-lowest`,()=>{
  const src=readFileSync(new URL(file,import.meta.url),'utf8');
  const expression=src.match(/(?:float median3\(vec3 c\)|fn median3\(c: vec3f\) -> f32)\s*\{\s*return ([^;]+);/)?.[1];
  expect(expression).toBeDefined();
  const median=new Function('c','min','max',`return ${expression}`) as (c:{r:number;g:number;b:number},min:typeof Math.min,max:typeof Math.max)=>number;
  for(const r of [0,.1,.49,.5,.51,.9,1])for(const g of [0,.1,.49,.5,.51,.9,1])for(const b of [0,.1,.49,.5,.51,.9,1])
   expect(median({r,g,b},Math.min,Math.max)).toBe([r,g,b].sort((a,b)=>a-b)[1]!);
 });
}
