import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:'vendor/supabase.js',legalComments:'eof'});
await mkdir('public/vendor',{recursive:true});
for(const file of ['index.html','styles.css','app.js','core.js','accounts.js','auth-client.js','library-sync.js','legacy-config.js','manifest.json','sw.js','icon-192.png','icon-512.png','vendor/supabase.js'])await copyFile(file,'public/'+file);
