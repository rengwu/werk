import type { Job } from "../sources/types.ts";
import {
  authoritativeSources,
  descriptionRank,
  descriptionQuality,
} from "./job-quality.ts";
import { locationOptions } from "../geo/locations.ts";
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
export const companyKey = (s: string) =>
  normalize(s).replace(
    /\s+(?:incorporated|inc|llc|ltd|limited|gmbh|s dn bhd|sdn bhd)$/,
    "",
  );
export const titleKey = (s: string) =>
  normalize(
    s
      .replace(/\((?:f\/m\/d|m\/f\/d|all genders)\)/gi, "")
      .replace(/\bfront[ -]end\b/gi, "frontend")
      .replace(/\bfull[ -]stack\b/gi, "fullstack")
      .replace(/\bsr\.?\s/gi, "senior "),
  );
export function postingIdentity(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const parts = u.pathname.split("/").filter(Boolean);
    if (
      [
        "boards.greenhouse.io",
        "job-boards.greenhouse.io",
        "boards.eu.greenhouse.io",
        "job-boards.eu.greenhouse.io",
      ].includes(host) &&
      parts[1] === "jobs" &&
      /^\d+$/.test(parts[2] || "")
    )
      return `greenhouse:${parts[0].toLowerCase()}:${parts[2]}`;
    if (
      host === "jobs.ashbyhq.com" &&
      parts.length >= 2 &&
      /^[\da-f-]{36}$/i.test(parts[1])
    )
      return `ashby:${parts[0].toLowerCase()}:${parts[1].toLowerCase()}`;
    if (
      ["jobs.lever.co", "jobs.eu.lever.co"].includes(host) &&
      parts.length >= 2 &&
      /^[\da-f-]{36}$/i.test(parts[1])
    )
      return `lever:${parts[0].toLowerCase()}:${parts[1].toLowerCase()}`;
  } catch {
    /* Invalid links cannot prove identity. */
  }
  return null;
}
function identities(job: Job): Set<string> {
  const urls = [
    job.url,
    job.applicationUrl || "",
    ...(job.sourceLinks || []).map((s) => s.url),
  ];
  // Only explicit job-specific ATS links establish identity, never company careers/home URLs.
  urls.push(...(job.description.match(/https?:\/\/[^\s<>"')]+/g) || []));
  return new Set(urls.map(postingIdentity).filter((s): s is string => !!s));
}
function shingles(text: string): Set<string> {
  const words = normalize(text).split(" ");
  const result = new Set<string>();
  for (let i = 0; i < words.length - 3; i++)
    result.add(words.slice(i, i + 4).join(" "));
  return result;
}
export function descriptionSimilarity(a: string, b: string): number {
  return shingleSimilarity(shingles(a), shingles(b));
}
function shingleSimilarity(x: Set<string>, y: Set<string>): number {
  if (Math.min(x.size, y.size) < 25) return 0;
  let intersection = 0;
  for (const s of x) if (y.has(s)) intersection++;
  return intersection / Math.max(x.size, y.size);
}
type DuplicateCache = {
  identities: WeakMap<Job, Set<string>>;
  shingles: WeakMap<Job, Set<string>>;
};
function memoized(
  cache: WeakMap<Job, Set<string>> | undefined,
  job: Job,
  build: (job: Job) => Set<string>,
) {
  let value = cache?.get(job);
  if (!value) {
    value = build(job);
    cache?.set(job, value);
  }
  return value;
}
export function duplicateReason(
  a: Job,
  b: Job,
  cache?: DuplicateCache,
): string | null {
  const ai = memoized(cache?.identities, a, identities),
    bi = memoized(cache?.identities, b, identities);
  if (ai.size === 1 && bi.size === 1 && [...ai].some((s) => bi.has(s)))
    return "Same employer posting";
  if (
    companyKey(a.company) !== companyKey(b.company) ||
    /^(not listed|unknown|confidential|hiring post|)$/.test(
      companyKey(a.company),
    ) ||
    titleKey(a.title) !== titleKey(b.title)
  )
    return null;
  // Different IDs from the employer are distinct requisitions, even when templated text is identical.
  if (
    authoritativeSources.has(a.sourceType) &&
    authoritativeSources.has(b.sourceType)
  )
    return null;
  if (ai.size && bi.size && ![...ai].some((s) => bi.has(s))) return null;
  if (descriptionQuality(a) !== "full" || descriptionQuality(b) !== "full")
    return null;
  const requisition = (j: Job) =>
    j.description
      .match(
        /(?:requisition|req(?:uisition)?[ -]?id|job[ -]?id|job number)\s*[:#-]?\s*([a-z]*\d[\w-]*)/i,
      )?.[1]
      ?.toLowerCase();
  const ar = requisition(a),
    br = requisition(b);
  if (ar && br && ar !== br) return null;
  const loc = (j: Job) =>
    locationOptions(j.location)
      .map((l) => l.value)
      .sort()
      .join("|");
  if (loc(a) !== loc(b) || loc(a).includes("__unspecified__")) return null;
  if (
    a.arrangement.toLowerCase() !== b.arrangement.toLowerCase() &&
    !/unspecified/i.test(a.arrangement + b.arrangement)
  )
    return null;
  if (
    a.employmentType !== b.employmentType &&
    /contract|part.?time/i.test(a.employmentType + b.employmentType)
  )
    return null;
  const dates = [
    a.publishedAt || a.firstSeenAt,
    b.publishedAt || b.firstSeenAt,
  ].map(Date.parse);
  if (Math.abs(dates[0] - dates[1]) > 45 * 86400000) return null;
  if ((a.availability === "closed") !== (b.availability === "closed"))
    return null;
  if (a.eligibility !== b.eligibility) return null;
  const similarity = shingleSimilarity(
    memoized(cache?.shingles, a, (job) => shingles(job.description)),
    memoized(cache?.shingles, b, (job) => shingles(job.description)),
  );
  return similarity >= (a.sourceId === b.sourceId ? 0.96 : 0.82)
    ? "Same employer, role, location, and substantially matching description"
    : null;
}
// Grouping is reversible. Every original ID, status, note and task stays intact.
export function groupDuplicates(jobs: Job[]): Job[] {
  // Only retain derived text for this snapshot. Repeated pair comparisons
  // should not tokenize the same description or parse its URLs again.
  const cache: DuplicateCache = {
    identities: new WeakMap(),
    shingles: new WeakMap(),
  };
  const buckets = new Map<string, Job[]>();
  const identityBuckets = new Map<string, Job[]>();
  const result = jobs.map(
    (j) =>
      ({
        ...j,
        duplicateOf: undefined,
        duplicateReason: undefined,
        relatedListings: undefined,
      }) as Job,
  );
  for (const job of result) {
    const key = `${companyKey(job.company)}|${titleKey(job.title)}`;
    buckets.set(key, [...(buckets.get(key) || []), job]);
    const ids = memoized(cache.identities, job, identities);
    if (ids.size === 1)
      for (const id of ids)
        identityBuckets.set(id, [...(identityBuckets.get(id) || []), job]);
  }
  const groups: Job[][] = [];
  const grouped = new Map<string, Job[]>();
  const checked = new Set<string>();
  for (const candidates of [...identityBuckets.values(), ...buckets.values()]) {
    for (let i = 0; i < candidates.length; i++)
      for (let k = i + 1; k < candidates.length; k++) {
        const a = candidates[i],
          b = candidates[k];
        const pair = [a.id, b.id].sort().join(":");
        if (checked.has(pair)) continue;
        checked.add(pair);
        const reason = duplicateReason(a, b, cache);
        if (!reason) continue;
        const ga = grouped.get(a.id),
          gb = grouped.get(b.id);
        if (ga && gb && ga !== gb) continue;
        const group = ga || gb || [a];
        const member = group.includes(a) ? b : a;
        // Complete-link grouping prevents A≈B≈C from folding A and C when their evidence differs.
        if (
          group.includes(member) ||
          !group.every((j) => duplicateReason(j, member, cache))
        )
          continue;
        if (!ga && !gb) groups.push(group);
        group.push(member);
        for (const j of group) grouped.set(j.id, group);
      }
  }
  for (const group of groups) {
    group.sort(
      (a, b) =>
        Number(["saved", "applied"].includes(b.status)) -
          Number(["saved", "applied"].includes(a.status)) ||
        Number(a.status === "skipped") - Number(b.status === "skipped") ||
        descriptionRank(b, b.sourceType) - descriptionRank(a, a.sourceType) ||
        a.firstSeenAt.localeCompare(b.firstSeenAt) ||
        a.id.localeCompare(b.id),
    );
    const primary = group[0];
    for (const j of group) {
      j.relatedListings = group
        .filter((other) => other.id !== j.id)
        .map((other) => ({
          id: other.id,
          name: other.sourceName,
          url: other.url,
          status: other.status,
        }));
      if (j !== primary) {
        j.duplicateOf = primary.id;
        j.duplicateReason = duplicateReason(primary, j, cache)!;
      }
    }
  }
  return result;
}
