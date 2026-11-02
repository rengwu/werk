import type { Profile } from '../../shared/profile.ts';
import type { IncomingJob } from '../sources/types.ts';
import { buildRegionLocationIndex } from '../geo/location-index.ts';
import { countryOverlaps } from '../geo/overlap.ts';
export function resolveLocation(location:string) {
  const index=buildRegionLocationIndex([{id:'one',location}]),values=index.byJob.get('one')!;
  const places=index.options.filter(o=>o.kind==='place'&&values.has(o.value));
  return {values,places:places.filter(o=>o.label!==o.aliases?.[0]).map(o=>o.value),uncertain:places.some(o=>o.label===o.aliases?.[0]),countries:[...values].filter(v=>v.startsWith('country:')).map(v=>v.slice(8))};
}
export function arrangementOf(value:string):'remote'|'hybrid'|'onsite'|null {
  return /hybrid/i.test(value)?'hybrid':/remote/i.test(value)?'remote':/on[ -]?site|in[ -]?office/i.test(value)?'onsite':null;
}
export function criteriaAssessment(item:IncomingJob,profile:Profile,overlaps=countryOverlaps(profile.criteria)) {
  const location=resolveLocation(item.location),arrangement=arrangementOf(item.arrangement);
  const hours=location.countries.map(c=>overlaps.get(c)).filter((v):v is number=>v!==undefined);
  const overlapHours=hours.length?Math.max(...hours):null;
  let conflict=!!arrangement && !!profile.criteria.arrangements.length && !profile.criteria.arrangements.includes(arrangement);
  const desired=profile.criteria.locations.filter(l=>l.kind!=='remote-from'||arrangement==='remote');
  // A location with exclusions, a partial resolution, or no recognized country/region is uncertain.
  const resolved=[...location.values].some(v=>/^(country|region):/.test(v));
  if(desired.length&&resolved&&!location.uncertain&&!location.values.has('__worldwide__')&&!/except|excluding|not including|outside/i.test(item.location)) {
    const possibilities=desired.map(l=>resolveLocation(l.value));
    const compatible=possibilities.some((p,i)=> {
      if(p.uncertain)return true;
      if(desired[i].kind==='city'&&p.places.length&&location.places.length&&!p.places.some(v=>location.places.includes(v)))return false;
      if(![...p.values].some(v=>/^(country|region):/.test(v)))return true;
      if(location.countries.length&&p.countries.length)return location.countries.some(c=>p.countries.includes(c));
      return [...p.values].some(v=>/^(country|region):/.test(v)&&location.values.has(v));
    });
    if(!compatible) conflict=true;
  }
  if(overlapHours!==null&&overlapHours<profile.criteria.minOverlapHours)conflict=true;
  return {countries:location.countries,locationValues:[...location.values],arrangement,overlapHours,conflict};
}
