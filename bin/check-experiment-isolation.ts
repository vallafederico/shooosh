/** Guard production source boundaries and the published root allowlist. */
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
const roots=['package','packages','web/src','examples','harness/src'];
const failures:string[]=[];
function scan(path:string){
 for(const name of readdirSync(path)){
  if(['node_modules','dist','.git'].includes(name))continue;
  const file=join(path,name);
  if(statSync(file).isDirectory()){scan(file);continue;}
  if(!/\.(ts|tsx|js|mjs|astro|json)$/.test(file))continue;
  const src=readFileSync(file,'utf8');
  if(/(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["'][^"']*(?:shooosh-experiment|(?:^|\/)experiment\/)/m.test(src))failures.push(file);
 }
}
roots.forEach(scan);
for(const file of ['package.json','web/package.json','harness/package.json','packages/model/package.json']){
 const p=JSON.parse(readFileSync(file,'utf8'));
 for(const deps of ['dependencies','devDependencies','optionalDependencies','peerDependencies'])if(p[deps]?.['shooosh-experiment'])failures.push(file+': dependency');
}
const root=JSON.parse(readFileSync('package.json','utf8'));
if(!Array.isArray(root.files)||root.files.some((x:string)=>x.includes('experiment')||x==='*'||x==='**/*'))failures.push('root publish allowlist');
const experiment=JSON.parse(readFileSync('experiment/package.json','utf8'));
if(experiment.private!==true||experiment.exports)failures.push('experiment must remain private without exports');
if(failures.length)throw new Error(`Experiment isolation violation: ${failures.join(', ')}`);
console.log('Experiment isolation checks passed');
