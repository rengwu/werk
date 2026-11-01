import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Criteria } from '../../shared/profile.ts';

const zoneTable = readFileSync(join(process.env.WERK_RESOURCES_DIR || resolve('resources'), 'geography/zone1970.tab'), 'utf8');
const zones = zoneTable.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const [countries,,zone] = line.split('\t'); return { countries: countries.split(','), zone: zone.trim() }; });
export function offsetHours(zone: string, at = Date.now()) {
  const name = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(at).find(p => p.type === 'timeZoneName')!.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
  if (name === 'GMT') return 0;
  if (!match) throw new Error('Timezone offset unavailable.');
  return (Number(match[2]) + Number(match[3])/60) * (match[1] === '-' ? -1 : 1);
}
const hour = (value: string) => { const [h,m] = value.split(':').map(Number); return h + m/60; };
export function overlapHours(userOffset: number, countryOffset: number, start = '09:00', end = '18:00') {
  const a = hour(start) - userOffset;
  let duration = hour(end) - hour(start); if (duration <= 0) duration += 24;
  const b = 9 - countryOffset;
  let overlap = 0;
  for (const shift of [-24,0,24]) overlap += Math.max(0, Math.min(a+duration,b+9+shift) - Math.max(a,b+shift));
  return Math.min(duration,9,overlap);
}
export function countryOverlaps(criteria: Criteria, at = Date.now()) {
  const offset = offsetHours(criteria.timezone, at), result = new Map<string,number>();
  for (const { countries,zone } of zones) {
    const overlap = overlapHours(offset,offsetHours(zone,at),criteria.workingHours.start,criteria.workingHours.end);
    for (const code of countries) result.set(code, Math.max(result.get(code) || 0, overlap));
  }
  return result;
}
