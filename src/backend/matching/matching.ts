import type { IncomingJob,Job,Profile } from '../sources/types.ts';
import { assessEligibility,requirementClauses } from './eligibility.ts';

// The legacy evidence caps remain; role/seniority claims now come from each
// user's profile instead of the archived candidate's frontend background.
export const MATCH_VERSION=6;
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const aliases:Record<string,string>={React:'react(?:\\.js|js)?','Next.js':'next(?:\\.js|js)',JavaScript:'javascript|ecmascript',TypeScript:'typescript',Go:'golang|go(?= (?:language|programming|developer|engineer))',Kubernetes:'kubernetes|k8s',Vue:'vue(?:\\.js|js)?','scikit-learn':'scikit[- ]learn','C++':'c\\+\\+','C#':'c#','.NET':'\\.net|dotnet'};
const technologyPattern=(s:string)=>new RegExp(`(?<![\\w])(?:${aliases[s]||escape(s)})(?![\\w])`,'i');
const families:[string,RegExp][]=[['software',/software|engineer|developer|architect|\bswe\b|programmer/i],['frontend',/front[ -]?end|\bUI\b|web|interface/i],['backend',/back[ -]?end|platform|infrastructure|devops|SRE/i],['fullstack',/full[ -]?stack|product engineer/i],['ai',/\bAI\b|\bLLM\b|agent|machine learning|\bML\b|applied/i],['mobile',/mobile|native|iOS|android/i],['design',/design|\bUX\b|\bUI\b/i],['data',/data|analytics|analyst/i],['product',/product manager|product owner/i]];
export function roleFit(title:string,targets:string[]) {
  const clean=(s:string)=>s.toLowerCase().replace(/\b(senior|junior|staff|principal|lead|graduate|remote)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const normalized=clean(title);
  if(targets.some(t=>clean(t)&&normalized.includes(clean(t))))return 'direct';
  const targetFamilies=new Set(families.filter(([,pattern])=>targets.some(t=>pattern.test(t))).map(([name])=>name));
  const titleFamilies=families.filter(([,pattern])=>pattern.test(title)).map(([name])=>name);
  if(titleFamilies.some(f=>targetFamilies.has(f)&&f!=='software'))return 'direct';
  if(targetFamilies.has('software')&&titleFamilies.includes('software')&&!/mechanical|civil|electrical|structural|chemical|industrial engineer/i.test(title))return 'adjacent';
  return 'other';
}
export function assessJob(job:IncomingJob,profile:Profile):Pick<Job,'category'|'score'|'reasons'|'gaps'|'eligibility'|'eligibilityNotes'|'eligibilityEvidence'|'remoteEligibility'|'matchVersion'|'matchScoreCap'|'matchProfileRevision'|'matchBreakdown'|'matchedEvidence'> & {highlights:Array<{start:number;end:number;kind:'matched'|'missing'}>} {
  const clauses=requirementClauses(job.description).filter(s=>!/equal opportunity|do not discriminate|without regard|regardless of/i.test(s));
  const content=`${job.title}\n${clauses.join('\n')}`,fit=roleFit(job.title,profile.criteria.targetRoles);
  const reasons:string[]=[],gaps:string[]=[],breakdown:NonNullable<Job['matchBreakdown']>=[],evidence:NonNullable<Job['matchedEvidence']>=[];
  const points=(label:string,n:number)=>breakdown.push({label,points:n});
  points('Role',fit==='direct'?54:fit==='adjacent'?40:0);
  if(fit!=='other')reasons.push(fit==='direct'?'The role matches a target role family.':'The role is adjacent to your target role families.');else gaps.push('The listed role is outside your target role families.');
  const skills=new Set([...profile.experience.flatMap(e=>e.technologies),...profile.projects.flatMap(p=>p.technologies)]);
  for(const technology of skills){if(!technologyPattern(technology).test(content))continue;const professional=profile.experience.filter(e=>e.technologies.includes(technology)),projects=profile.projects.filter(p=>p.technologies.includes(technology));evidence.push({technology,basis:professional.length?'professional':'project',ids:(professional.length?professional:projects).map(e=>e.id)});}
  points('Technologies',Math.min(18,evidence.reduce((n,e)=>n+(e.basis==='professional'?4:2),0)));
  for(const basis of ['professional','project'] as const){const names=evidence.filter(e=>e.basis===basis).map(e=>e.technology);if(names.length)reasons.push(`${basis==='professional'?'Professional experience':'Project evidence'}: ${names.slice(0,7).join(', ')}.`);}
  const senior=/\bsenior\b|\bsr\.?\b/i.test(job.title),staff=/staff|principal|distinguished/i.test(job.title),junior=/junior|internship|\bintern\b|graduate|entry[ -]level/i.test(job.title);
  const candidateSenior=profile.experience.some(e=>/senior|lead|staff|principal/i.test(e.title||''));
  const candidateStaff=profile.experience.some(e=>/staff|principal|distinguished/i.test(e.title||''));
  points('Level',senior?(candidateSenior?8:0):staff?(candidateStaff?8:0):4);
  let cap=100;
  if(staff&&!candidateStaff){gaps.push('Staff or principal scope is not established by the profile.');cap=64;}
  if(senior&&!candidateSenior){gaps.push('Senior scope needs confirmation against your evidence.');cap=Math.min(cap,64);}
  if(junior&&candidateSenior&&!profile.criteria.targetRoles.some(t=>/junior|intern|graduate/i.test(t))){gaps.push('The listed level is below the documented senior roles.');cap=Math.min(cap,34);}
  const requirements=clauses.filter(s=>/require|must|minimum|at least|you (?:have|bring)|experience (?:with|in)|\d\+? years|proficien|expertise/i.test(s)&&!/preferred|nice.to.have|bonus|not required/i.test(s));
  const totalYears=Number(profile.basics.professionalExperienceYearsApproximate??NaN);
  for(const clause of requirements){const years=clause.match(/(?:at least |minimum (?:of )?)?(\d{1,2})(?:\+|\s*[-–]\s*\d{1,2})?\s*(?:years|yrs)/i);if(years&&/\bAI\b|\bML\b|machine learning|LLM|deep learning|model training/.test(clause)){gaps.push('Professional AI/ML years are not established by total engineering tenure or project work.');cap=Math.min(cap,64);}else if(years&&Number.isFinite(totalYears)&&Number(years[1])>totalYears){gaps.push(`The posting asks for ${years[1]}+ years; the profile records about ${totalYears} total professional years.`);cap=Math.min(cap,64);}}
  if(requirements.some(s=>/Ph\.?D|doctorate|publications|distributed training|CUDA|pre[ -]?training/i.test(s))){gaps.push('Check the required research credentials and specialist experience against the profile.');cap=Math.min(cap,64);}
  const missingTech=Object.keys(aliases).filter(t=>requirements.some(s=>technologyPattern(t).test(s))&&!skills.has(t));
  if(missingTech.length){gaps.push(`Requirements without recorded technology evidence: ${missingTech.join(', ')}.`);cap=Math.min(cap,64);}
  if(job.descriptionQuality==='excerpt'||job.description.trim().length<80){gaps.push('The description is incomplete; this match is provisional.');cap=Math.min(cap,64);}
  const raw=breakdown.reduce((n,p)=>n+p.points,0),score=Math.max(0,Math.min(cap,raw));if(score<raw)points('Evidence limit',score-raw);
  const highlights:Array<{start:number;end:number;kind:'matched'|'missing'}>=[];
  for(const clause of clauses){const start=job.description.indexOf(clause);if(start<0)continue;const missing=requirements.includes(clause)&&(missingTech.some(t=>technologyPattern(t).test(clause))||(/\d.*years.*(?:AI|ML|LLM)/.test(clause)));const matched=evidence.some(e=>technologyPattern(e.technology).test(clause));if(missing||matched)highlights.push({start,end:start+clause.length,kind:missing?'missing':'matched'});}
  return {score,category:score>=65?'strong':score>=40?'adjacent':score>=20?'stretch':'other',reasons,gaps:[...new Set(gaps)],matchBreakdown:breakdown,matchedEvidence:evidence,matchVersion:MATCH_VERSION,matchScoreCap:cap,matchProfileRevision:profile.revision,highlights,...assessEligibility(job,profile)};
}
