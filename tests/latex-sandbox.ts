import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,copyFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename,resolve} from 'node:path';
import {compileLatex} from '../src/backend/cv/compile.ts';
import {renderCv} from '../src/backend/cv/template.ts';
import {fictionalProfile} from './fixtures/profile.ts';
import {extractPdf} from '../src/backend/assistant/attachments.ts';
const output=resolve('smoke-output/latex');await mkdir(output,{recursive:true});
const dir=await mkdtemp(join(tmpdir(),'werk-latex-probes-')),privateFile=join(dir,'private.txt'),writeTarget=join(dir,'write.txt'),pdfFile=join(dir,'private.pdf'),fontFile=join(dir,'private.ttf');
const results:{result:string;scenarios:string[];error?:string}={result:'Failed',scenarios:[]};
const slash=(path:string)=>path.replaceAll('\\','/');
const wrap=(body:string)=>`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}`;
try {
 const good=await compileLatex(renderCv(fictionalProfile()));assert.ok(good.pdf.length>1000);await writeFile(pdfFile,good.pdf);await writeFile(join(output,'fictional-cv.pdf'),good.pdf);
 const text=await extractPdf(good.pdf);assert.match(text,/Alex Example/);assert.match(text,/Example planner/);results.scenarios.push('Offline master CV compiles and contains only the fictional profile');
 await writeFile(privateFile,'WERK_PRIVATE_SENTINEL');await writeFile(writeTarget,'unchanged');
 const probes=[
  ['absolute input',wrap(`\\input{"${slash(privateFile)}"}`)],
  ['indirect input',wrap(`\\csname input\\endcsname{"${slash(privateFile)}"}`)],
  ['relative traversal',wrap(`\\input{"../${basename(dir)}/private.txt"}`)],
  ['PDF image read',wrap(`\\XeTeXpdffile "${slash(pdfFile)}"`) ],
 ];
 for(const [name,source] of probes){await assert.rejects(compileLatex(source));results.scenarios.push(`${name} denied`);}
 const opened=await compileLatex(wrap(`\\newread\\secret\n\\openin\\secret="${slash(privateFile)}"\n\\ifeof\\secret BLOCKED\\else\\read\\secret to\\leak\\leak\\fi`));assert.match(await extractPdf(opened.pdf),/BLOCKED/);results.scenarios.push('openin cannot read private data');
 if(process.platform==='darwin'){const outside=await compileLatex(wrap('\\newread\\outside\n\\openin\\outside="/etc/hosts"\n\\ifeof\\outside BLOCKED\\else OPENED\\fi'));assert.match(await extractPdf(outside.pdf),/BLOCKED/);results.scenarios.push('Reads outside the document, cache and system-runtime allowlist denied');}
 for(const path of [slash(writeTarget),`../${basename(dir)}/write.txt`]){await compileLatex(wrap(`\\newwrite\\outside\n\\immediate\\openout\\outside="${path}"\n\\immediate\\write\\outside{changed}`)).catch(()=>{});assert.equal(await readFile(writeTarget,'utf8'),'unchanged');}results.scenarios.push('Absolute and relative openout cannot change external files');
 const osFont=process.platform==='win32'?join(process.env.SystemRoot!,'Fonts','arial.ttf'):'/System/Library/Fonts/Supplemental/Arial.ttf';await copyFile(osFont,fontFile);await assert.rejects(compileLatex(wrap(`\\font\\privatefont="[${slash(fontFile)}]" at 10pt\n\\privatefont Secret`)));results.scenarios.push('Private font file read denied');
 await compileLatex(wrap(`\\immediate\\write18{${process.platform==='win32'?'echo changed >':'echo changed >'} "${slash(writeTarget)}"}\nShell escape disabled.`));assert.equal(await readFile(writeTarget,'utf8'),'unchanged');results.scenarios.push('Shell escape cannot execute an external write');
 await assert.rejects(compileLatex('\\documentclass{article}\\begin{document}\\undefinedWerkCommand\\end{document}'));results.scenarios.push('Invalid LaTeX returns diagnostics');
 const controller=new AbortController();const running=compileLatex(wrap('\\def\\again{\\again}\\again'),controller.signal);setTimeout(()=>controller.abort(),300);await assert.rejects(running);results.scenarios.push('Cancellation stops a looping compiler');
 results.result='Passed';
}catch(error){results.error=error instanceof Error?error.message:String(error);throw error;}
finally{await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify(results,null,2));
