import { readFileSync } from "node:fs";
import {join,resolve} from "node:path";
import type { Job } from "../sources/types.ts";
import {
  buildLocationIndex,
  foldLocation as fold,
  type LocationOption,
} from "./locations.ts";
import {
  countryRegion,
  locationGroups,
  locationRegions,
  parentRegions,
} from "./location-regions.ts";

// Server-only data: never ship the gazetteer to the browser or call a geocoding service.
const geography = JSON.parse(
  readFileSync(
    join(process.env.WERK_RESOURCES_DIR || resolve("resources"), "geography/geonames.json"),
    "utf8",
  ),
) as {
  countries: [string, string, string, string][];
  places: Record<string, string[]>;
  usStates: Record<string, string[]>;
};
const countries = new Map(
  geography.countries
    .filter(([code]) => !["AN", "CS"].includes(code))
    .map(([code, iso3, label, continent]) => [
      code,
      {
        code,
        iso3,
        label,
        region: countryRegion(code, continent),
      },
    ]),
);
const countryNames = new Map<string, string>();
// These codes also commonly mean a state/province. A bare abbreviation is insufficient.
const ambiguousCodes = new Set(
  "AL AR AZ BA CA CO CT DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NS NT NV NY OH OK ON OR PA PE PR QC RI SC SD SK TN TX UT VA VT WA WI WV WY SA NT ACT TAS VIC QLD NSW NL".split(
    " ",
  ),
);
for (const country of countries.values()) {
  countryNames.set(fold(country.label), country.code);
  countryNames.set(fold(country.iso3), country.code);
  if (!ambiguousCodes.has(country.code))
    countryNames.set(fold(country.code), country.code);
}
const extraNames: Record<string, string> = {
  "united states of america": "US",
  uk: "GB",
  "great britain": "GB",
  "viet nam": "VN",
  vietnam: "VN",
  "republic of korea": "KR",
  "korea, republic of": "KR",
  "south korea": "KR",
  "north korea": "KP",
  "lao pdr": "LA",
  "lao people's democratic republic": "LA",
  "brunei darussalam": "BN",
  "east timor": "TL",
  "timor leste": "TL",
  macau: "MO",
  turkey: "TR",
  turkiye: "TR",
  "czech republic": "CZ",
  uae: "AE",
  "russian federation": "RU",
  "mainland china": "CN",
  "hong kong sar": "HK",
  "taiwan roc": "TW",
};
for (const [name, code] of Object.entries(extraNames))
  countryNames.set(name, code);
// An unqualified Georgia might be the US state. Keep it unresolved, including on search.
countryNames.delete("georgia");
const regionNames = new Map(
  locationRegions.flatMap((region) =>
    [region.label, ...region.aliases].map(
      (label) => [fold(label), region.id] as const,
    ),
  ),
);
const cityAliases: Record<string, string> = {
  kl: "kuala lumpur",
  nyc: "new york city",
  sf: "san francisco",
  bangalore: "bengaluru",
  saigon: "ho chi minh city",
  hcmc: "ho chi minh city",
};
const countryPatterns = [...countryNames]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([name, code]) => {
    const literal = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
      code,
      pattern: new RegExp(`(?:^${literal}\\s+[-–—]\\s+|[\\s–—-]${literal}$)`),
    };
  });
function countryContext(token: string) {
  if (/\b(?:except|excluding|not including|outside)\b/.test(token))
    return undefined;
  return (
    countryNames.get(token) ||
    countryPatterns.find(({ pattern }) => pattern.test(token))?.code
  );
}
const countryGroup = (region: string | undefined) => {
  if (region === "anz") return "Oceania";
  if (region === "south-america") return "Latin America & Caribbean";
  return locationRegions.find((r) => r.id === region)?.group || "Other regions";
};

export function buildRegionLocationIndex(
  jobs: (Pick<Job, "id" | "location"> & Partial<Pick<Job, "sourceType">>)[],
) {
  const raw = buildLocationIndex(jobs);
  const originalOptions = new Map(
    raw.options.map((option) => [option.value, option]),
  );
  const byJob = new Map<string, Set<string>>();
  const observedCountries = new Set<string>();
  const resolvedPlaces = new Map<string, Set<string>>();
  const countryTerms = new Map<string, Set<string>>();
  const usedRaw = new Set<string>();
  const rawCountries = new Map<string, string>();
  const rawRegions = new Map<string, string>();
  const contextCountries = new Map(
    raw.options.map((o) => [o.value, countryContext(o.value)]),
  );
  for (const job of jobs) {
    const rawValues = raw.byJob.get(job.id)!;
    const values = new Set(rawValues); // Retain old browser selections without data migration.
    const addRegion = (id: string) => {
      values.add(`region:${id}`);
      for (const parent of parentRegions(id)) values.add(`region:${parent}`);
    };
    const addCountry = (code: string, token: string) => {
      const country = countries.get(code);
      if (!country) return;
      values.add(`country:${code}`);
      observedCountries.add(code);
      if (country.region) addRegion(country.region);
      const terms = countryTerms.get(code) || new Set<string>();
      terms.add(originalOptions.get(token)?.label || token);
      countryTerms.set(code, terms);
    };
    // Explicit country context can disambiguate a city; it never broadens a qualified exclusion.
    const explicit = new Set(
      [...rawValues].flatMap((token) => contextCountries.get(token) || []),
    );
    if (
      [...rawValues].some((token) =>
        geography.usStates[cityAliases[token] || token]?.some((state) =>
          rawValues.has(fold(state)),
        ),
      )
    )
      explicit.add("US");
    for (const token of rawValues) {
      usedRaw.add(token);
      if (token.startsWith("__")) continue;
      if (/\b(?:except|excluding|not including|outside)\b/i.test(token))
        continue;
      const country = countryNames.get(token);
      const region = regionNames.get(token);
      if (country) {
        addCountry(country, token);
        rawCountries.set(token, country);
      } else if (region) {
        addRegion(region);
        rawRegions.set(token, region);
      } else {
        const context = contextCountries.get(token);
        const candidates = geography.places[cityAliases[token] || token] || [];
        const contextual = explicit.size
          ? candidates.filter((code) => explicit.has(code))
          : candidates;
        if (context || (contextual.length === 1 && token !== "georgia")) {
          const code = context || contextual[0];
          addCountry(code, token);
          const matches = resolvedPlaces.get(token) || new Set<string>();
          matches.add(code);
          resolvedPlaces.set(token, matches);
        } else {
          // Mark unresolved occurrences too: don't label all occurrences as one country.
          const matches = resolvedPlaces.get(token) || new Set<string>();
          matches.add("");
          resolvedPlaces.set(token, matches);
        }
      }
    }
    if (
      ![...values].some(
        (value) =>
          value.startsWith("country:") ||
          value.startsWith("region:") ||
          value.startsWith("__"),
      )
    )
      values.add("__unresolved__");
    byJob.set(job.id, values);
  }
  const options: LocationOption[] = raw.options
    .filter((o) => o.value.startsWith("__"))
    .map((o) => ({
      ...o,
      kind: "special",
      group: o.value === "__worldwide__" ? "Regions" : "Coverage",
    }));
  if ([...byJob.values()].some((values) => values.has("__unresolved__")))
    options.push({
      value: "__unresolved__",
      label: "Unresolved",
      kind: "special",
      group: "Coverage",
    });
  for (const region of locationRegions) {
    options.push({
      value: `region:${region.id}`,
      label: region.label,
      kind: "region",
      group: region.group,
      aliases: region.aliases,
      legacyValues: [...rawRegions]
        .filter(([, id]) => id === region.id)
        .map(([token]) => token),
    });
  }
  for (const country of countries.values()) {
    // Keep every SEA/East Asian country or area easy to select, even with no current listings.
    if (
      !observedCountries.has(country.code) &&
      !["southeast-asia", "east-asia"].includes(country.region || "")
    )
      continue;
    options.push({
      value: `country:${country.code}`,
      label: country.label,
      kind: "country",
      group: countryGroup(country.region),
      aliases: [
        ...new Set([
          country.code,
          country.iso3,
          ...[...countryNames]
            .filter(([, code]) => code === country.code)
            .map(([name]) => name),
          ...(countryTerms.get(country.code) || []),
        ]),
      ],
      legacyValues: [...rawCountries]
        .filter(([, code]) => code === country.code)
        .map(([token]) => token),
    });
  }
  for (const token of usedRaw) {
    if (
      token.startsWith("__") ||
      rawCountries.has(token) ||
      rawRegions.has(token)
    )
      continue;
    const original = originalOptions.get(token)!;
    const codes = resolvedPlaces.get(token);
    const country =
      codes?.size === 1 ? countries.get([...codes][0]) : undefined;
    options.push({
      ...original,
      label: country ? `${original.label}, ${country.label}` : original.label,
      kind: "place",
      group: "Cities and other locations",
      aliases: [original.label],
    });
  }
  const order = (o: LocationOption) =>
    locationGroups.indexOf(o.group || "Cities and other locations");
  const priority = (o: LocationOption) => {
    if (o.value === "__worldwide__") return -1;
    if (o.kind === "special")
      return ["__worldwide__", "__unspecified__", "__unresolved__"].indexOf(
        o.value,
      );
    if (o.group === "Regions")
      return ["region:apac", "region:emea", "region:americas"].indexOf(o.value);
    return o.kind === "region" ? 0 : o.value === "country:MY" ? 1 : 2;
  };
  options.sort(
    (a, b) =>
      order(a) - order(b) ||
      priority(a) - priority(b) ||
      a.label.localeCompare(b.label, "en"),
  );
  return { byJob, options };
}
