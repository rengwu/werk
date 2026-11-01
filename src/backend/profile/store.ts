import { profileSchema } from '../../shared/profile.ts';
import type { Profile } from '../../shared/profile.ts';
import type { Store } from '../db/store.ts';
import { emptyProfile, profileReadiness } from './facts.ts';

export type ProfileVersion = { revision: number; changedBy: string; summary: string; createdAt: string };
export class Profiles {
  store: Store;
  changed: () => void;
  onSave: (profile: Profile) => void = () => {};
  constructor(store: Store, changed: () => void) { this.store = store; this.changed = changed; }
  get(): Profile {
    const row = this.store.db.prepare('SELECT document FROM profile_versions ORDER BY revision DESC LIMIT 1').get();
    return row ? JSON.parse(String(row.document)) as Profile : emptyProfile();
  }
  state() { const profile = this.get(); return { profile, readiness: profileReadiness(profile), versions: this.versions() }; }
  versions(): ProfileVersion[] { return this.store.db.prepare('SELECT revision,changed_by AS changedBy,summary,created_at AS createdAt FROM profile_versions ORDER BY revision DESC').all() as ProfileVersion[]; }
  save(document: Profile, expectedRevision: number, changedBy: 'user' | 'assistant' | 'restore', summary: string, evidence: unknown[] = []) {
    if (this.get().revision !== expectedRevision) throw new Error('The profile changed. Review the current version before saving.');
    const profile = profileSchema.parse({ ...document, revision: expectedRevision + 1 });
    this.store.db.prepare('INSERT INTO profile_versions VALUES(?,?,?,?,?,?)').run(profile.revision, JSON.stringify(profile), changedBy, summary, JSON.stringify(evidence), new Date().toISOString());
    this.onSave(profile);
    return profile;
  }
  edit(section: string, value: unknown, expectedRevision: number) {
    if (!['basics','criteria','experience','projects','education','awards','facts','preferences','openItems'].includes(section)) throw new Error('Unknown profile section.');
    const result = this.store.transaction(() => {
      const profile = this.get();
      const source = `profile-edit:${expectedRevision + 1}`;
      const next = { ...profile, [section]: value } as Profile;
      const strings = (values: string[]) => values.map(v=>v.trim()).filter(Boolean);
      if(section==='criteria') { next.criteria.targetRoles=strings(next.criteria.targetRoles);next.criteria.hiddenCompanies=strings(next.criteria.hiddenCompanies); }
      if(section==='preferences' && Array.isArray(next.preferences.workAuthorizationCountries)) next.preferences.workAuthorizationCountries=strings(next.preferences.workAuthorizationCountries as string[]);
      if(section==='projects') for(const p of next.projects) { p.bullets=strings(p.bullets);p.technologies=strings(p.technologies); }
      if(section==='experience') for(const e of next.experience) { e.bullets=e.bullets.filter(b=>b.text.trim());e.technologies=strings(e.technologies); }
      next.sources.push({ id: source, type: 'user_statement', description: `User edited ${section}: ${JSON.stringify(value).slice(0,35000)}` });
      if (section === 'basics') next.basics = { ...next.basics, sources: [...new Set([...next.basics.sources, source])] };
      if (section === 'facts') next.facts = next.facts?.map(f => ({ ...f, sources: [...new Set([...f.sources, source])] }));
      if (section === 'projects') next.projects = next.projects.map(p => ({ ...p, sources: [...new Set([...p.sources, source])] }));
      if (section === 'experience') next.experience = next.experience.map(e => ({ ...e, bullets: e.bullets.map(b => ({ ...b, sources: [...new Set([...b.sources, source])] })) }));
      return this.save(next, expectedRevision, 'user', `Edited ${section}`, [{ source, quote: JSON.stringify(value) }]);
    });
    this.changed(); return result;
  }
  restore(revision: number, expectedRevision: number) {
    const row = this.store.db.prepare('SELECT document FROM profile_versions WHERE revision=?').get(revision);
    if (!row) throw new Error('Profile version not found.');
    const result = this.store.transaction(() => this.save(JSON.parse(String(row.document)), expectedRevision, 'restore', `Restored revision ${revision}`));
    this.changed(); return result;
  }
}
