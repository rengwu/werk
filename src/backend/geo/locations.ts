import type { Job } from "../sources/types.ts";
import { locationRegions } from "./location-regions.ts";

export type LocationOption = {
  value: string;
  label: string;
  kind?: "country" | "region" | "place" | "special";
  group?: string;
  aliases?: string[];
  legacyValues?: string[];
};
export const unspecifiedLocation: LocationOption = {
  value: "__unspecified__",
  label: "Unspecified",
};
const worldwide: LocationOption = {
  value: "__worldwide__",
  label: "Worldwide",
};
export const foldLocation = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
const fold = foldLocation;
const aliases = new Map([
  ["us", "United States"],
  ["usa", "United States"],
  ["united states of america", "United States"],
  ["uk", "United Kingdom"],
  ["gb", "United Kingdom"],
  ["gbr", "United Kingdom"],
  ["nyc", "New York City"],
  ["sf", "San Francisco"],
  ["asia pacific", "APAC"],
  ["asia-pacific", "APAC"],
  ["emea", "EMEA"],
  ["apac", "APAC"],
  ["latam", "LATAM"],
]);
const searchAliases = new Map([
  ...aliases,
  ...locationRegions.flatMap((region) =>
    [region.label, ...region.aliases].map(
      (label) => [fold(label), region.label] as const,
    ),
  ),
]);
const noPlace =
  /^(?:|remote|fully remote|100% remote|remote[- ]first|remote[- ]friendly|on[- ]?site|hybrid|flexible|unspecified|not (?:specified|listed)|unknown|n\/?a|any|various|multiple locations|full[- ]?time|part[- ]?time|contract)$/i;
const isWorldwide =
  /^(?:worldwide|world[- ]wide|global|globally|anywhere(?: in (?:the )?world)?|any location|all countries)$/i;

/** Facets use only the source's location field, never incidental description/HQ mentions.
 * Keep cities and regions as stated: no geocoding or inferred work authorization.
 */
export function locationOptions(raw: string): LocationOption[] {
  if (noPlace.test(raw.trim())) return [unspecifiedLocation];
  if (/\b(?:except|excluding|not including|outside)\b/i.test(raw))
    return [{ value: fold(raw), label: raw.trim() }];
  raw = raw.replace(/\(([^()]+)\)/g, (_, value: string) =>
    noPlace.test(value.trim()) ? "" : `, ${value}`,
  );
  const result = new Map<string, LocationOption>();
  for (let part of raw.split(/[,;|·•\n/]+/)) {
    part = part
      .replace(/\s+/g, " ")
      .trim()
      .replace(
        /^(?:or\s+)?(?:fully\s+)?(?:remote(?:[- ]friendly)?|hybrid|on[- ]?site)\s*[-:–—]\s*/i,
        "",
      )
      .replace(
        /\s*\((?:fully )?(?:remote|hybrid|on[- ]?site)(?: only)?\)\s*$/i,
        "",
      )
      .replace(/^(?:fully )?remote\s+(?:in|from)\s+/i, "")
      .replace(/\s*[-–—]\s*(?:remote|hybrid|on[- ]?site)$/i, "")
      .replace(/\s+only$/i, "")
      .trim();
    if (
      noPlace.test(part) ||
      part.length > 120 ||
      !/\p{L}/u.test(part) ||
      /https?:|@|\$|€|£|%|\bequity\b/i.test(part)
    )
      continue;
    // Keep qualified statements intact: 'Worldwide except US' is not a worldwide claim.
    if (isWorldwide.test(part)) {
      result.set(worldwide.value, worldwide);
      continue;
    }
    const label = aliases.get(fold(part)) || part;
    const value = fold(label);
    if (value) result.set(value, { value, label });
  }
  return result.size ? [...result.values()] : [unspecifiedLocation];
}

export function buildLocationIndex(
  jobs: (Pick<Job, "id" | "location"> & Partial<Pick<Job, "sourceType">>)[],
) {
  const organic = (job: { sourceType?: string }) =>
    ["hn", "hn_jobs", "x"].includes(job.sourceType || "");
  const candidates = new Map(
    jobs.map((job) => [job.id, locationOptions(job.location)]),
  );
  // Organic posts have free-form headers which may mix locations, salaries and role names.
  // Accept their location tokens only when also present in structured board data.
  const known = new Set([
    worldwide.value,
    unspecifiedLocation.value,
    ...jobs
      .filter((job) => !organic(job))
      .flatMap((job) => candidates.get(job.id)!.map((p) => p.value)),
  ]);
  const byJob = new Map<string, Set<string>>();
  const options = new Map<string, LocationOption>();
  for (const job of jobs) {
    let places = candidates.get(job.id)!;
    if (organic(job)) places = places.filter((place) => known.has(place.value));
    if (!places.length) places = [unspecifiedLocation];
    byJob.set(job.id, new Set(places.map((p) => p.value)));
    for (const place of places)
      if (!options.has(place.value)) options.set(place.value, place);
  }
  const order = (value: string) =>
    value === worldwide.value ? 0 : value === unspecifiedLocation.value ? 1 : 2;
  return {
    byJob,
    options: [...options.values()].sort(
      (a, b) =>
        order(a.value) - order(b.value) || a.label.localeCompare(b.label, "en"),
    ),
  };
}

export function matchesLocations(
  values: ReadonlySet<string> | undefined,
  selected: readonly string[],
) {
  return selected.length === 0 || selected.some((value) => values?.has(value));
}

export function searchLocation(option: LocationOption, query: string) {
  const search = fold(query);
  const alias = searchAliases.get(search);
  if (alias)
    return (
      fold(option.label) === fold(alias) ||
      !!option.aliases?.some((name) => fold(name) === fold(alias))
    );
  if (option.aliases?.some((alias) => fold(alias).includes(search)))
    return true;
  return (
    fold(option.label).includes(search) ||
    (option.value === worldwide.value && isWorldwide.test(query.trim())) ||
    (option.value === unspecifiedLocation.value && noPlace.test(query.trim()))
  );
}

export function locationLabel(
  job: Pick<Job, "sourceType" | "sourceName" | "locationScope">,
) {
  // Legacy records predate locationScope. These adapters stored explicit candidate regions.
  const hiring =
    job.locationScope === "hiring" ||
    (!job.locationScope &&
      (["himalayas", "remotive", "jobicy"].includes(job.sourceType) ||
        (job.sourceType === "rss" &&
          job.sourceName.startsWith("We Work Remotely"))));
  return hiring ? "Hiring locations" : "Location";
}

export function parseLocationSelection(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (v): v is string =>
                typeof v === "string" && v.length > 0 && v.length <= 1500,
            ),
          ),
        ].slice(0, 50)
      : [];
  } catch {
    return [];
  }
}
