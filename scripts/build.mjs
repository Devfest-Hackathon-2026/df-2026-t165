import {build} from 'esbuild';
import {mkdir,cp,rm,writeFile} from 'node:fs/promises';
await mkdir('public/vendor',{recursive:true});
await build({stdin:{contents:"export {GoogleGenAI,Modality} from '@google/genai';",resolveDir:process.cwd(),loader:'js'},bundle:true,format:'esm',platform:'browser',outfile:'public/vendor/google-genai.js',minify:true});
await cp('src/domain.mjs','public/domain.js');
await rm('dist',{recursive:true,force:true});await cp('public','dist',{recursive:true});
await mkdir('dist/api',{recursive:true});await writeFile('dist/api/config',JSON.stringify({aiReady:false,requiresCode:false,storage:'browser'}));
console.log('Browser SDK bundled; static preview packaged. Cloud Run serves public/.');
