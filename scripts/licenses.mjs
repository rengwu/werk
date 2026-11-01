import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
// Preserve the license texts for bundled JavaScript as well as external pi dependencies.
export async function writeNotices(){
  const lock=JSON.parse(await readFile('package-lock.json','utf8'));
  const notices=['werk third-party notices\n\nElectron also includes LICENSE and LICENSES.chromium.html. Tectonic and the CV starter have licenses under the installed Resources/licenses and Resources/latex directories.\n'];
  for(const [path,pkg] of Object.entries(lock.packages).sort(([a],[b])=>a.localeCompare(b))){
    if(!path.startsWith('node_modules/'))continue;
    const name=path.split('node_modules/').at(-1);let files;
    try{files=await readdir(path);}catch{continue;}
    const texts=[];
    for(const file of files.filter(name=>/^(licen[cs]e|copying|notice)(?:[.-].*)?$/i.test(name))){try{texts.push(`${file}\n${await readFile(join(path,file),'utf8')}`);}catch{/* directory, not a license file */}}
    notices.push(`\n${'='.repeat(72)}\n${name} ${pkg.version||''} — ${pkg.license||'See package license'}\n${texts.join('\n')||`Source: https://www.npmjs.com/package/${name}/v/${pkg.version}`}\n`);
  }
  await writeFile('out/THIRD_PARTY_NOTICES.txt',notices.join('\n'));
}
