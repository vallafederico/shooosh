import type { Config } from './contract';
export type Curves = { rows:number; sha256:string; glyphs:Record<string,{row:number;bounds:number[];bandTransform:number[]}>; curves:number[][];bands:number[][][] };
export type Atlas = { chars:{id:number;x:number;y:number;width:number;height:number;xoffset:number;yoffset:number}[];common:{scaleW:number;scaleH:number;base:number};info:{size:number} };
export async function assets(kind: "msdf"|"sdf"|"slug" = "msdf") {
  const read = async (url:string) => { const r=await fetch(url); if(!r.ok)throw new Error(`Asset ${url}: ${r.status}`);return r.json(); };
  const [slug,msdf] = await Promise.all([read('/text-bench/abel-metadata.json'),kind === "slug" ? Promise.resolve(null) : read(`/text-bench/abel-${kind}.json`)]);
  return {slug:slug as Curves,msdf:msdf as Atlas};
}
export const identity='Abel-Regular.ttf; matched offline assets';
export function position(i:number,c:Config) {
  const columns=Math.floor((c.width-32)/c.fontSize);
  return [16+(i%columns)*c.fontSize,16+Math.floor(i/columns)*c.fontSize*1.5+c.fontSize];
}
export function capacity(c:Config) {return Math.floor((c.width-32)/c.fontSize)*Math.floor((c.height-32)/(c.fontSize*1.5));}
