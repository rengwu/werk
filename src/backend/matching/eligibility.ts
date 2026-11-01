import type { IncomingJob, Job, Profile } from "../sources/types.ts";
import { buildRegionLocationIndex } from "../geo/location-index.ts";

// Country vocabulary is deliberately bounded. Unrecognized locations require review.
const countries: [string, RegExp][] = [
  ["Malaysia", /\bmalaysia(?:n)?\b/i],
  [
    "United States",
    /\bunited states(?: of america)?\b|\bu\.?s\.?a?\b|\bamerican\b/i,
  ],
  ["United Kingdom", /\bunited kingdom\b|\bu\.?k\b|\bbritish\b/i],
  ["Singapore", /\bsingapore(?:an)?\b/i],
  ["Canada", /\bcanad(?:a|ian)\b/i],
  ["Australia", /\baustralia(?:n)?\b/i],
  ["New Zealand", /\bnew zealand\b/i],
  ["Germany", /\bgerman(?:y)?\b/i],
  ["France", /\bfrance\b|\bfrench\b/i],
  ["Netherlands", /\bnetherlands\b|\bdutch\b/i],
  ["Ireland", /\bireland\b|\birish\b/i],
  ["India", /\bindia(?:n)?\b/i],
  ["Japan", /\bjapan(?:ese)?\b/i],
  ["China", /\bchina\b|\bchinese\b/i],
  ["Philippines", /\bphilippines\b|\bfilipino\b/i],
  ["Indonesia", /\bindonesia(?:n)?\b/i],
  ["Thailand", /\bthailand\b|\bthai\b/i],
  ["Vietnam", /\bvietnam(?:ese)?\b/i],
];
export function namedCountries(text: string): string[] {
  // Lowercase pronoun 'us' is never a country.
  return countries
    .filter(([name, pattern]) =>
      pattern.test(
        name === "United States" ? text.replace(/\bus\b/g, "") : text,
      ),
    )
    .map(([name]) => name);
}
const eeo =
  /equal opportunity|do not discriminate|without regard|regardless of|protected characteristic|national origin/i;
export function requirementClauses(text: string): string[] {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\bU\.S\.(?:A\.)?/g, "United States")
    .replace(/\bU\.K\./g, "United Kingdom")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}
export function assessEligibility(
  job: IncomingJob,
  profile: Profile,
): Pick<
  Job,
  | "eligibility"
  | "eligibilityNotes"
  | "eligibilityEvidence"
  | "remoteEligibility"
> {
  const evidence: NonNullable<Job["eligibilityEvidence"]> = [];
  const notes: string[] = [];
  const add = (
    rule: string,
    text: string,
    outcome: "review" | "incompatible",
    source: "description" | "location" = "description",
  ) => {
    if (!evidence.some((e) => e.rule === rule && e.text === text))
      evidence.push({ rule, text: text.slice(0, 700), outcome, source });
  };
  const citizenship = namedCountries(profile.basics.citizenship);
  const home = namedCountries(profile.basics.location);
  const explicit = profile.preferences.workAuthorizationCountries;
  const outside = explicit;
  const authorizations = [
    ...(Array.isArray(outside)
      ? outside.flatMap((s) => namedCountries(String(s)))
      : []),
  ];
  const authorizationKnown =
    Array.isArray(outside) &&
    (Array.isArray(explicit) || citizenship.length > 0);
  const relocation = profile.preferences.relocation === true || profile.criteria.locations.some(l=>l.relocation);
  const locations = buildRegionLocationIndex([{id:"job",location:job.location},{id:"home",location:profile.basics.location}]).byJob;
  const jobLocations = locations.get("job")!, homeLocations = locations.get("home")!;
  const jobCountries = [...jobLocations].filter(v=>v.startsWith("country:"));
  const hiringIncludesHome = jobLocations.has("__worldwide__") || (jobCountries.length ? jobCountries.some(v=>homeLocations.has(v)) : [...jobLocations].some(v=>v.startsWith("region:")&&homeLocations.has(v)));
  const clauses = requirementClauses(job.description).filter(
    (s) => !eeo.test(s),
  );
  const uncertainSponsor = clauses.filter((s) =>
    /(?:cannot|can.t|unable to|not).{0,30}(?:guarantee|every role|every candidate|all roles|all candidates).{0,30}sponsor|(?:cannot|can.t|unable to|not).{0,30}sponsor.{0,35}(?:every|all) (?:role|candidate)/i.test(
      s,
    ),
  );
  for (const text of uncertainSponsor)
    add("sponsorship_conditions", text, "review");
  const noSponsor = clauses
    .filter(
      (s) =>
        /(?:no|without|not (?:offer|provide|available|support)|cannot|can't|unable to|do not|does not|will not|won't).{0,65}(?:visa |immigration |work permit )?sponsor|sponsorship.{0,30}(?:not (?:available|provided|offered)|unavailable)/i.test(
          s,
        ) &&
        !/no.{0,20}(?:need|requirement).{0,20}sponsor|(?:no )?(?:visa )?sponsorship (?:is )?(?:not )?(?:required|needed)/i.test(
          s,
        ),
    )
    .filter((s) => !uncertainSponsor.includes(s));
  const sponsor = clauses.filter(
    (s) =>
      /(?:we|company).{0,20}(?:do |can |will )?(?:offer|provide|support|sponsor).{0,25}(?:visa|sponsorship|work permit)|visa sponsorship (?:is )?(?:available|provided|offered)/i.test(
        s,
      ) && !noSponsor.includes(s),
  );
  const independentVisa = clauses.some((s) =>
    /independently obtain|self[- ]sponsor|own (?:visa|work permit)/i.test(s),
  );
  const scope = job.locationScope === "hiring";
  const listedCountries = namedCountries(job.location);
  const foreignOnly =
    listedCountries.length > 0 &&
    !listedCountries.some((c) => authorizations.includes(c));
  const remote = /remote/i.test(job.arrangement);
  let remoteEligibility: Job["remoteEligibility"] = "unknown";
  if (remote && scope) {
    if (/except|excluding|outside|not including/i.test(job.location)) {
      add("hiring_location_exceptions", job.location, "review", "location");
    } else if (
      hiringIncludesHome
    ) {
      remoteEligibility = "possible";
      notes.push(
        "The listed hiring area includes your location; other requirements still apply.",
      );
    } else if (
      foreignOnly ||
      /\b(?:Europe|EMEA|LATAM|North America|EU|EEA)\b/i.test(job.location)
    ) {
      remoteEligibility = "restricted";
      add("hiring_locations", job.location, "review", "location");
      notes.push(
        relocation
          ? "Remote hiring excludes your current location. Relocation and work authorization need confirmation."
          : "Remote hiring excludes your current location.",
      );
    }
  }
  for (const clause of clauses) {
    if (
      /citizen|citizenship/i.test(clause) &&
      !/(?:citizenship|citizens?).{0,50}(?:not required|preferred|not mandatory)/i.test(
        clause,
      ) &&
      !/citizenship (?:is )?not required|(?:no|without) citizenship requirement/i.test(
        clause,
      )
    ) {
      const countryPattern = countries
        .map(([, pattern]) => `(?:${pattern.source})`)
        .join("|");
      const required = new RegExp(
        `(?:must (?:be|have)|require[ds]?|only hire|limited to|restricted to)\\s+(?:(?:a|an|verification of)\\s+)?(?:${countryPattern})\\s+(?:citizen|citizenship|persons)|(?:citizenship|citizens?).{0,25}(?:required|mandatory|only|necessary)`,
        "i",
      ).test(clause);
      const allowed = namedCountries(clause);
      const alternatives =
        /permanent residen|green card|asylum|refugee|or.{0,30}work authori[sz]/i.test(
          clause,
        );
      if (
        required &&
        citizenship.length > 0 &&
        allowed.length &&
        !allowed.some((c) => citizenship.includes(c))
      ) {
        // Residency alternatives cannot be ruled out unless the candidate has confirmed authorization countries.
        add(
          "citizenship",
          clause,
          alternatives &&
            (!authorizationKnown ||
              allowed.some((c) => authorizations.includes(c)))
            ? "review"
            : "incompatible",
        );
      } else if (required && (!allowed.length || !citizenship.length))
        add("citizenship", clause, "review");
    }
    if (/security clearance|TS\/SCI|US person|U\.S\. person/i.test(clause))
      add("clearance", clause, "review");
    if (
      /right to work|work authori[sz]|authori[sz]ed to work|eligible to work|work permit/i.test(
        clause,
      )
    ) {
      const targets = namedCountries(clause);
      const requiredNow =
        /(?:must (?:already |currently )?(?:have|be)|need to have).{0,50}(?:work|authori)|(?:existing|current).{0,25}(?:right to work|work authori)|(?:right to work|work authori[sz]ation).{0,30}required/i.test(
          clause,
        );
      const withoutSupport = noSponsor.includes(clause) || noSponsor.length > 0;
      const mismatch =
        targets.length > 0 && !targets.some((c) => authorizations.includes(c));
      if (
        requiredNow &&
        mismatch &&
        authorizationKnown &&
        !independentVisa &&
        !/or.{0,45}(?:sponsor|relocat)|obtain.{0,30}(?:start|commenc)/i.test(
          clause,
        )
      ) {
        // Explicit existing authorization is a role-specific requirement even if company boilerplate mentions visas.
        add(
          "existing_authorization",
          clause,
          /existing|already|currently/i.test(clause) || withoutSupport
            ? "incompatible"
            : "review",
        );
      } else add("work_authorization", clause, "review");
    }
    if (
      /(?:must|only|require[ds]?).{0,40}(?:resid[ei]|be based|located|live in)|(?:candidates|applicants).{0,20}(?:based|residing|located) in/i.test(
        clause,
      )
    ) {
      const targets = namedCountries(clause);
      if (home.length && targets.length && !targets.some((c) => home.includes(c))) {
        remoteEligibility = remote ? "restricted" : remoteEligibility;
        const currentOnly =
          /(?:already|currently).{0,30}(?:resid|based|located|live)|(?:no|not (?:offer|provide)|cannot).{0,25}relocat/i.test(
            clause,
          );
        add(
          "residency",
          clause,
          currentOnly && !/or.{0,40}relocat/i.test(clause)
            ? "incompatible"
            : "review",
        );
      }
    }
  }
  const authorizationRequired = clauses.filter((s) =>
    /(?:must|only hire[sd]?|open only|need to).{0,100}(?:authori[sz]ed to work|work authori[sz]ation|right to work)/i.test(
      s,
    ),
  );
  const foreignAuthorizationRequired = authorizationRequired.some((s) => {
    const targets = namedCountries(s);
    return targets.length
      ? !targets.some((c) => authorizations.includes(c))
      : foreignOnly;
  });
  for (const clause of noSponsor) {
    const targets = namedCountries(clause);
    const knownForeign = targets.length
      ? !targets.some((c) => authorizations.includes(c))
      : foreignOnly;
    const conflict =
      sponsor.length > 0 ||
      (scope &&
        listedCountries.some((c) => home.includes(c)) &&
        targets.length > 0 &&
        !targets.some((c) => home.includes(c)));
    add(
      "sponsorship_unavailable",
      clause,
      knownForeign &&
        authorizationKnown &&
        foreignAuthorizationRequired &&
        !conflict &&
        !independentVisa
        ? "incompatible"
        : "review",
    );
  }
  if (sponsor.length)
    notes.push(
      "The posting mentions visa support; eligibility and role-specific conditions need confirmation.",
    );
  const applicantLocations = clauses.find((s) =>
    /^Applicant locations:/i.test(s),
  );
  const worldwide = clauses.find(
    (s) =>
      !/\b(?:not|except|excluding)\b/i.test(s) &&
      /(?:applicants?|candidates?|hir(?:e|ing)|eligible|work from).{0,50}(?:worldwide|anywhere in the world)|(?:worldwide|anywhere in the world).{0,50}(?:eligible|applicants?|candidates?)/i.test(
        s,
      ),
  );
  if (
    applicantLocations &&
    namedCountries(applicantLocations).length &&
    worldwide
  ) {
    remoteEligibility = "unknown";
    for (let i = notes.length - 1; i >= 0; i--)
      if (notes[i].startsWith("Remote hiring excludes")) notes.splice(i, 1);
    // Uncertainty about hiring location does not erase independent authorization requirements.
    for (const e of evidence)
      if (["hiring_locations", "residency"].includes(e.rule))
        e.outcome = "review";
    add("hiring_conflict", `${worldwide} / ${applicantLocations}`, "review");
    notes.push(
      "Conflicting hiring locations in the posting; eligibility needs confirmation.",
    );
  }
  if (remote && remoteEligibility === "unknown")
    notes.push(
      `Remote work does not establish hiring eligibility from ${profile.basics.location || "your location"}.`,
    );
  if (relocation && foreignOnly && !noSponsor.length && !sponsor.length)
    notes.push(
      "Relocation is within your preferences; visa support is not established.",
    );
  if (
    clauses.some((s) =>
      /\btime.?zones?\b|\bUTC\b|\bGMT\b|\d.{0,12}hours?.{0,25}overlap|overlap.{0,25}(?:hours|time.?zone)|\bcore hours\b/i.test(
        s,
      ),
    )
  ) {
    const time = clauses.find((s) =>
      /\btime.?zones?\b|\bUTC\b|\bGMT\b|\d.{0,12}hours?.{0,25}overlap|overlap.{0,25}(?:hours|time.?zone)|\bcore hours\b/i.test(
        s,
      ),
    )!;
    add("working_hours", time, "review");
  }
  const eligibility = evidence.some((e) => e.outcome === "incompatible")
    ? "incompatible"
    : evidence.length
      ? "review"
      : "unknown";
  if (!evidence.length && !notes.length)
    notes.push(
      "Citizenship, work authorization, and sponsorship requirements are not established.",
    );
  return {
    eligibility,
    eligibilityEvidence: evidence,
    remoteEligibility,
    eligibilityNotes: [
      ...[...evidence]
        .sort(
          (a, b) =>
            Number(b.outcome === "incompatible") -
            Number(a.outcome === "incompatible"),
        )
        .map(
          (e) =>
            `${e.outcome === "incompatible" ? "Conflict" : "Check"}: ${e.text}`,
        ),
      ...notes,
    ],
  };
}
