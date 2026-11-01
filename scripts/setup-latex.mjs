import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,rm,rename,chmod,realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {macSandbox,compileLatex} from '../src/backend/cv/compile.ts';
const runtime=resolve('resources/runtime'),binDir=join(runtime,'bin'),cache=join(runtime,'cache');
const release={
  'darwin-arm64':{target:'aarch64-apple-darwin',sha256:'24bd46566fa30d41101848405e9cbc4645edb92d8f857c9d21262174fb70cd33'},
  'win32-x64':{target:'x86_64-pc-windows-msvc',sha256:'1d6bb76f049c8a3774f6e9d66e4b04e1a8c3dcb37527b6b41b7e894328e7bf29'},
}[`${process.platform}-${process.arch}`];
if(!release)throw new Error('werk supports macOS arm64 and Windows x64.');
const binary=join(binDir,process.platform==='win32'?'tectonic.exe':'tectonic');
async function run(command,args,cwd,env=process.env) {
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,env,stdio:'inherit',windowsHide:true});
    const timeout=setTimeout(()=>child.kill('SIGKILL'),300000);
    child.once('error',error=>{clearTimeout(timeout);reject(error);});
    child.once('close',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error(`Compiler setup failed (${code}).`));});
  });
}
await mkdir(binDir,{recursive:true});await mkdir(cache,{recursive:true});
if(!existsSync(binary)){
  const staging=await mkdtemp(join(binDir,'.install-'));
  try{const extension=process.platform==='win32'?'zip':'tar.gz',url=`https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-${release.target}.${extension}`;
    const response=await fetch(url,{signal:AbortSignal.timeout(300000)});if(!response.ok)throw new Error(`Compiler download returned HTTP ${response.status}.`);
    const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==release.sha256)throw new Error('Compiler archive checksum mismatch.');
    const archive=join(staging,`archive.${extension}`);await writeFile(archive,bytes);await run('tar',['-xf',archive,'-C',staging],staging);
    const name=process.platform==='win32'?'tectonic.exe':'tectonic';await chmod(join(staging,name),0o755);await rename(join(staging,name),binary);
  }finally{await rm(staging,{recursive:true,force:true});}
}
if(process.platform==='win32')await run('go',['build','-trimpath','-o',join(binDir,'texsandbox.exe'),'./cmd/texsandbox'],resolve('tools/texsandbox'));
const starter=await readFile(resolve('resources/latex/starter.tex'),'utf8');
// Build-only package preparation: fixed repository fixture, isolated work/home,
// sandboxed file access. This path is never bundled into the application.
if(process.platform==='darwin'){
  const work=await realpath(await mkdtemp(join(tmpdir(),'werk-package-setup-')));
  try{const trustedSource=starter.replace('Edit your resume here.',String.raw`Compiler package preparation. \textbf{Bold} \textit{Italic} \textbf{\textit{Both}} \textbar{} \textbackslash{} \textasciitilde{} \textasciicircum{} \section{Experience} \begin{entries} \role{Engineer}{2020 -- Present}{Example Studio}{Remote} \begin{details} \item Built accessible components. \end{details} \project{Planner}{https://example.com}{TypeScript} \end{entries}`);
    const profile=macSandbox(work,await realpath(cache),await realpath(binary)).replace('(deny network*)','').replace('(deny file-write*)',`(deny file-write*)\n (allow file-write* (subpath ${JSON.stringify(await realpath(cache))}))`);
    for(const size of [10,11,12]){await writeFile(join(work,'starter.tex'),trustedSource.replace('[11pt,a4paper]',`[${size}pt,a4paper]`));await run('/usr/bin/sandbox-exec',['-p',profile,binary,'--untrusted','starter.tex'],work,{PATH:'/usr/bin:/bin',HOME:work,TMPDIR:work,TECTONIC_CACHE_DIR:cache,XDG_CACHE_HOME:cache,TECTONIC_UNTRUSTED_MODE:'1',LANG:'en_US.UTF-8'});}
  }finally{await rm(work,{recursive:true,force:true});}
}
// Windows uses the same offline package cache prepared by the macOS CI job.
// Both platforms now prove the exact runtime path, with network disabled.
for(const size of [10,11,12])await compileLatex(starter.replace('[11pt,a4paper]',`[${size}pt,a4paper]`));
console.log('Offline LaTeX compiler and OS sandbox verified.');
