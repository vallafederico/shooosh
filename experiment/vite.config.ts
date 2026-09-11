import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig(({mode})=>({
  server:{port:5199},
  define:{__TEXT_RENDERER__:JSON.stringify(mode.replace('startup-',''))},
  build:{outDir:mode.startsWith('startup-')?`dist/${mode}`:'dist',manifest:true,rollupOptions:{input:fileURLToPath(new URL(mode.startsWith('startup-')?'./startup.html':'./text-bench.html',import.meta.url))}},
  resolve:{alias:{shooosh:fileURLToPath(new URL('../package/index.ts',import.meta.url))}},
}));
