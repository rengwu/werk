import { z } from 'zod';
import { profileSchema } from '../../shared/profile.ts';
import type { Profile } from '../../shared/profile.ts';
export const profileEditsSchema = z.array(z.object({ op: z.enum(['set','remove']), path: z.string().max(300), valueJson: z.string().max(40000), evidenceQuote: z.string().trim().min(1).max(16000) }).strict()).max(40);
export type Evidence = { id: string; text: string; name?: string; url?: string };
const forbidden = new Set(['__proto__','prototype','constructor']);
function safeValue(value: unknown, depth = 0) {
  if (depth > 15) throw new Error('Profile change is too deeply nested.');
  if (value && typeof value === 'object') for (const [key,child] of Object.entries(value)) { if (forbidden.has(key)) throw new Error('Invalid profile field.'); safeValue(child, depth + 1); }
}
export function applyProfileEdits(profile: Profile, raw: unknown, evidence: Evidence[]) {
  const edits = profileEditsSchema.parse(raw), next = structuredClone(profile);
  for (const edit of edits) {
    if (!evidence.some(e => e.text.includes(edit.evidenceQuote))) throw new Error(`A profile change has no supporting quote for ${edit.path}: ${JSON.stringify(edit.evidenceQuote.slice(0,180))}. Read the source again and use its exact text. No facts were changed.`);
    const parts = edit.path.split('/').slice(1).map(p => p.replace(/~1/g,'/').replace(/~0/g,'~'));
    if (!edit.path.startsWith('/') || parts.length < 2 || parts.length > 8 || parts.some(p => !p || forbidden.has(p)) || !['basics','criteria','experience','projects','education','awards','facts','preferences','openItems'].includes(parts[0]) || (parts[0] === 'basics' && parts[1] === 'sources')) throw new Error('Unsupported profile change.');
    if (parts[0] === 'facts' && !next.facts) next.facts = [];
    let parent: unknown = next;
    for (const key of parts.slice(0,-1)) {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent,key)) throw new Error('The profile field does not exist.');
      parent = (parent as Record<string,unknown>)[key];
    }
    if (!parent || typeof parent !== 'object') throw new Error('The profile field does not exist.');
    const key = parts.at(-1)!;
    if (Array.isArray(parent) && key !== '-' && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= parent.length)) throw new Error('The profile entry does not exist.');
    if (edit.op === 'remove') {
      if (!Object.hasOwn(parent,key)) throw new Error('The profile entry does not exist.');
      if (Array.isArray(parent)) parent.splice(Number(key),1); else delete (parent as Record<string,unknown>)[key];
    } else {
      const value = JSON.parse(edit.valueJson); safeValue(value);
      if (Array.isArray(parent) && key === '-') parent.push(value); else (parent as Record<string,unknown>)[key] = value;
    }
  }
  for (const source of evidence.filter(e => edits.some(edit => e.text.includes(edit.evidenceQuote)))) {
    if (!next.sources.some(s => s.id === source.id)) next.sources.push({ id: source.id, type: source.url ? 'public_reference' : 'user_statement', url: source.url, description: `${source.name || ''}\n${source.text}`.slice(0,40000) });
    if (edits.some(e => e.path.startsWith('/basics/') && source.text.includes(e.evidenceQuote)) && !next.basics.sources.includes(source.id)) next.basics.sources.push(source.id);
  }
  return profileSchema.parse(next);
}
