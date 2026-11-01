import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {Profile} from '../../shared/profile.ts';
export const latexEscape=(value:string)=>value.replace(/[\\{}$&#%_^~]/g,char=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','%':'\\%','_':'\\_','^':'\\textasciicircum{}','~':'\\textasciitilde{}'}[char]!));
function date(value:Profile['experience'][number]['start']){return value.display||[value.month?new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(Date.UTC(2000,value.month-1)):null,value.year].filter(Boolean).join(' ');}
export function renderCv(profile:Profile){
  const template=readFileSync(join(process.env.WERK_RESOURCES_DIR||resolve('resources'),'latex/starter.tex'),'utf8');
  const esc=latexEscape,body:string[]=[];
  body.push(`{\\LARGE\\bfseries ${esc(profile.basics.name)}}\\par`);
  const contacts=[profile.basics.location,profile.basics.email,profile.basics.phone,profile.basics.website,profile.basics.github,profile.basics.linkedin].filter(Boolean).map(value=>esc(String(value)));
  if(contacts.length)body.push(`\\vspace{4pt} {\\small ${contacts.join(' \\textbar{} ')}}\\par`);
  if(profile.basics.summary)body.push(`\\section{Summary}\n${esc(profile.basics.summary)}`);
  if(profile.experience.length){body.push('\\section{Experience}\n\\begin{entries}');for(const e of profile.experience){const dates=[date(e.start),e.isCurrent?'Present':date(e.end)].filter(Boolean).join(' -- ');body.push(`\\role{${esc(e.title||e.employer)}}{${esc(dates)}}{${esc(e.title?e.employer:'')}}{${esc(e.location||'')}}`);const bullets=e.bullets.filter(b=>b.status!=='inferred');if(bullets.length)body.push('\\begin{details}',...bullets.map(b=>'\\item '+esc(b.text)),'\\end{details}');}body.push('\\end{entries}');}
  if(profile.projects.length){body.push('\\section{Projects}\n\\begin{entries}');for(const p of profile.projects){body.push(`\\item {\\bfseries ${esc(p.name)}}\\par`,esc(p.summary));if(p.url)body.push(`\\par {\\small ${esc(p.url)}}`);if(p.attribution)body.push(`\\par ${esc(p.attribution)}`);if(p.bullets.length)body.push('\\begin{details}',...p.bullets.map(b=>'\\item '+esc(b)),'\\end{details}');}body.push('\\end{entries}');}
  if(profile.education.length){body.push('\\section{Education}');for(const e of profile.education){body.push(`{\\bfseries ${esc(e.institution)}}\\hfill ${esc([date(e.start),date(e.end)].filter(Boolean).join(' -- '))}\\par`,`${esc([e.qualification,e.specialization].filter(Boolean).join(', '))}\\par`);}}
  const skills=[...new Set([...profile.experience.flatMap(e=>e.technologies),...profile.projects.flatMap(p=>p.technologies)])];if(skills.length)body.push('\\section{Skills}',esc(skills.join(', ')));
  if(profile.awards.length){body.push('\\section{Awards}');for(const a of profile.awards)body.push(`${esc(a.name)} -- ${esc(a.result)} (${a.year})\\par`);}
  return template.slice(0,template.indexOf('\\begin{document}'))+'\\begin{document}\n'+body.join('\n')+'\n\\end{document}\n';
}
