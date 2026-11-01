import { parseDocument } from "htmlparser2";
import {
  findAll,
  getElementsByTagName,
  getOuterHTML,
  textContent,
} from "domutils";
import type { Element } from "domhandler";
import { XMLParser } from "fast-xml-parser";
import { boardFor } from "./catalog.ts";
import type { IncomingJob } from "../types.ts";
import { htmlText, sourceDate } from "../source-text.ts";

type RecordValue = Record<string, any>;
const arr = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const str = (v: any): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";
const text = (v: any) => htmlText(str(v));
export class BoardUnavailableError extends Error {}
export function jobUrl(key: string, raw: string, base?: string): string | null {
  const board = boardFor(key);
  try {
    const u = new URL(raw, base || board.seeds[0]);
    const hosts = board.hosts || board.seeds.map((s) => new URL(s).hostname);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      !hosts.some(
        (h) =>
          u.hostname === h || (board.hosts && u.hostname.endsWith(`.${h}`)),
      )
    )
      return null;
    u.pathname = u.pathname.replace(/\/$/, "");
    if (!new RegExp(board.jobPath).test(u.pathname)) return null;
    if (key === "relocate" && u.pathname.includes("/the-global-move/"))
      return null;
    u.search = "";
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}
export function itemId(key: string, url: string): string {
  const u = new URL(url);
  if (key === "linkedin") return u.pathname.match(/-(\d+)$/)?.[1] || u.pathname;
  if (key === "getonboard") return u.pathname.split("/").at(-1)!;
  return u.pathname;
}
export function lead(
  key: string,
  url: string,
  title = "Job opening",
): IncomingJob {
  return {
    sourceItemId: itemId(key, url),
    title: title.trim().slice(0, 400) || "Job opening",
    company: "Not listed",
    url,
    location: "",
    arrangement: "Unspecified",
    employmentType: "Unspecified",
    salary: "",
    description: "",
    descriptionQuality: "excerpt",
    kind: "opening",
    publishedAt: null,
  };
}
// Some publishers put literal tabs/newlines inside JSON-LD strings. Repair only
// control characters; never execute script text or guess missing quotes/fields.
function parseStructuredJson(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    let quoted = false,
      escaped = false,
      repaired = "";
    for (const char of input) {
      if (quoted && char.charCodeAt(0) < 32) {
        repaired += JSON.stringify(char).slice(1, -1);
        escaped = false;
        continue;
      }
      repaired += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\" && quoted) escaped = true;
      else if (char === '"') quoted = !quoted;
    }
    return JSON.parse(repaired);
  }
}
function document(html: string) {
  const root = parseDocument(html);
  const scripts = getElementsByTagName("script", root.children);
  const data: RecordValue[] = [];
  const visit = (v: any) => {
    for (const obj of arr(v))
      if (obj && typeof obj === "object") {
        if (arr(obj["@type"]).includes("JobPosting")) data.push(obj);
        else if (obj["@graph"]) visit(obj["@graph"]);
      }
  };
  for (const script of scripts.filter(
    (e) => e.attribs.type === "application/ld+json",
  )) {
    try {
      visit(parseStructuredJson(textContent(script)));
    } catch {
      /* other page widgets may be malformed */
    }
  }
  let page: RecordValue = {};
  const next = scripts.find((e) => e.attribs.id === "__NEXT_DATA__");
  if (next)
    try {
      page = JSON.parse(textContent(next)).props?.pageProps || {};
    } catch {
      /* fall back to public HTML */
    }
  return { root, data, page };
}
function place(v: any): string {
  if (typeof v === "string") return v;
  if (!v) return "";
  if (v.address) return place(v.address);
  const address = [
    v.addressLocality,
    v.addressRegion,
    v.addressCountry?.name || v.addressCountry,
  ].filter((x) => typeof x === "string");
  return [...new Set(address)].join(", ") || str(v.name);
}
function salary(v: any): string {
  if (!v) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  const value = v.value ?? v;
  return [
    v.currency,
    typeof value === "object"
      ? [value.minValue ?? value.min, value.maxValue ?? value.max]
          .filter((x) => x != null)
          .join("–") || value.value
      : value,
    value.unitText || v.type,
  ]
    .filter((x) => typeof x === "string" || typeof x === "number")
    .join(" ");
}
function schemaJob(key: string, url: string, j: RecordValue): IncomingJob {
  const base = lead(key, url, text(j.title));
  const locations = arr(j.jobLocation).map(place).filter(Boolean);
  const hiring = arr(j.applicantLocationRequirements)
    .map(place)
    .filter(Boolean);
  const remote = /telecommute|remote/i.test(arr(j.jobLocationType).join(" "));
  const description = text(j.description);
  // Hiring countries are not office locations, and must not imply permission to work.
  return {
    ...base,
    company:
      text(j.hiringOrganization?.name || j.hiringOrganization) || "Not listed",
    location:
      locations.join(" · ") ||
      (remote ? (hiring.length < 50 ? hiring.join(" · ") : "") : ""),
    locationScope: locations.length ? "listed" : "hiring",
    arrangement: remote ? "Remote" : "Unspecified",
    employmentType: arr(j.employmentType).map(str).join(" · ") || "Unspecified",
    salary: salary(j.baseSalary),
    publishedAt: sourceDate(j.datePosted),
    expiresAt: sourceDate(j.validThrough),
    description: retainHiringLocations(description, j),
    descriptionQuality:
      description.length >= 200 && !/(?:\.{3}|…)\s*$/.test(description)
        ? "full"
        : "excerpt",
  };
}
function retainHiringLocations(
  description: string,
  posting: RecordValue,
): string {
  const hiring = arr(posting.applicantLocationRequirements)
    .map(place)
    .filter(Boolean);
  const restriction =
    hiring.length && hiring.length < 50
      ? `Applicant locations: ${hiring.join(" · ")}`
      : "";
  return restriction && !description.includes(restriction)
    ? `${description}\n\n${restriction}`
    : description;
}
function hiredlyJob(j: RecordValue): IncomingJob | null {
  const url = jobUrl("hiredly", `/jobs/${j.slug}`);
  if (!url || !j.title) return null;
  const full = text(j.description);
  const requirements = text(j.requirements);
  const preferences = j.globalHirePreferences || {};
  const arrangements = [
    ["Remote", preferences.workingArrangementRemote],
    ["Hybrid", preferences.workingArrangementHybrid],
    ["On-site", preferences.workingArrangementOnSite],
  ]
    .filter((x) => x[1])
    .map((x) => x[0]);
  return {
    ...lead("hiredly", url, j.title),
    company: j.company?.name || "Not listed",
    location: [j.location, j.stateRegion, "Malaysia"]
      .filter(Boolean)
      .join(" · "),
    arrangement: arrangements.join(" · ") || "Unspecified",
    employmentType: str(j.jobType) || "Unspecified",
    salary: j.salary ? `MYR ${j.salary}` : "",
    publishedAt: sourceDate(j.activeAt),
    description: [
      full,
      requirements && `Requirements\n${requirements}`,
      preferences.rightToWorkOpenToSponsor &&
        "Employer is open to visa sponsorship.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    descriptionQuality: full ? "full" : "excerpt",
    expiresAt:
      j.expired || j.active === false
        ? sourceDate(j.activeAt) || "1970-01-01T00:00:00.000Z"
        : undefined,
  };
}
function getOnBoard(json: RecordValue) {
  if (!Array.isArray(json.data))
    throw new BoardUnavailableError(
      "The public API did not return job records.",
    );
  const jobs: IncomingJob[] = json.data.flatMap((row: RecordValue) => {
    const j = row.attributes;
    const url = jobUrl("getonboard", row.links?.public_url);
    if (!url || !j?.title) return [];
    return [
      {
        ...lead("getonboard", url, j.title),
        sourceItemId: row.id,
        company: j.company?.data?.attributes?.name || "Not listed",
        location: arr(j.countries).join(" · "),
        arrangement: j.remote
          ? "Remote"
          : j.remote_modality === "hybrid"
            ? "Hybrid"
            : "Unspecified",
        description: [
          j.projects,
          j.functions_headline,
          j.functions,
          j.description_headline,
          j.description,
          j.desirable_headline,
          j.desirable,
          j.benefits_headline,
          j.benefits,
          j.remote_zone && `Remote zone: ${j.remote_zone}`,
          j.remote_modality === "remote_local" &&
            "Remote within the employer's permitted locations; worldwide hiring is not confirmed.",
        ]
          .filter(Boolean)
          .map(text)
          .join("\n\n"),
        descriptionQuality: "full" as const,
        publishedAt: sourceDate(j.published_at),
      },
    ];
  });
  return {
    jobs,
    hasNext: Number(json.meta?.page) < Number(json.meta?.total_pages),
  };
}
export function parseBoardListing(
  key: string,
  html: string,
  url: string,
): { jobs: IncomingJob[]; next: string | null } {
  if (key === "getonboard") {
    const result = getOnBoard(JSON.parse(html));
    const next = new URL(url);
    next.searchParams.set(
      "page",
      String(Number(next.searchParams.get("page") || 1) + 1),
    );
    return { jobs: result.jobs, next: result.hasNext ? next.href : null };
  }
  if (key === "jobspresso" && /<rss\b/.test(html)) {
    const feed = new XMLParser({ ignoreAttributes: false }).parse(html).rss
      ?.channel;
    if (!feed)
      throw new BoardUnavailableError("The jobs feed was not readable.");
    return {
      jobs: arr(feed.item).flatMap((j: RecordValue) => {
        const url = jobUrl(key, str(j.link));
        if (!url) return [];
        const description = text(j["content:encoded"] || j.description);
        return [
          {
            ...lead(key, url, text(j.title)),
            company: text(j["job_listing:company"]) || "Not listed",
            location: text(j["job_listing:location"]),
            description,
            descriptionQuality: j["content:encoded"]
              ? ("full" as const)
              : ("excerpt" as const),
            employmentType: text(j["job_listing:job_type"]) || "Unspecified",
            publishedAt: sourceDate(j.pubDate),
          },
        ];
      }),
      next: null,
    };
  }
  const { root, page } = document(html);
  const jobs = new Map<string, IncomingJob>();
  const add = (job: IncomingJob | null) => {
    if (job && jobUrl(key, job.url)) jobs.set(job.url, job);
  };
  if (key === "hiredly") for (const j of arr(page.jobs)) add(hiredlyJob(j));
  if (key === "cake")
    for (const j of Object.values(
      page.initialState?.jobSearch?.entityByPathId || {},
    ) as RecordValue[]) {
      const url = jobUrl(key, `/companies/${j.page?.path}/jobs/${j.path}`);
      if (!url || !j.title) continue;
      add({
        ...lead(key, url, j.title),
        company: j.page?.name || "Not listed",
        location:
          arr(j.locationsWithLocale)
            .map((l) => l.en)
            .filter(Boolean)
            .join(" · ") || arr(j.locations).join(" · "),
        description: text(j.description),
        descriptionQuality: "excerpt",
        salary: salary(j.salary),
        employmentType: j.jobType || "Unspecified",
      });
    }
  if (key === "arc")
    for (const [field, path] of [
      ["arcJobs", "details"],
      ["externalJobs", "j"],
    ])
      for (const j of arr(page[field])) {
        const url = jobUrl(
          key,
          `/remote-jobs/${path}/${j.urlString}-${j.randomKey}`,
        );
        if (!url || !j.title) continue;
        add({
          ...lead(key, url, j.title),
          company: j.company?.name || "Not listed",
          location: arr(j.requiredCountries)
            .map(place)
            .filter(Boolean)
            .join(" · "),
          locationScope: "hiring",
          arrangement: "Remote",
          employmentType: str(j.jobType) || "Unspecified",
          publishedAt: sourceDate(j.postedAt),
          description: [
            j.clientTimeZoneRestriction,
            j.timeZone,
            j.overlapHours && `Required overlap: ${j.overlapHours} hours`,
          ]
            .filter(Boolean)
            .map(str)
            .join("\n"),
        });
      }
  const links = getElementsByTagName("a", root.children);
  for (const a of links) {
    const target = jobUrl(key, a.attribs.href, url);
    if (
      !target ||
      (jobs.has(target) && jobs.get(target)!.title !== "Job opening")
    )
      continue;
    const heading =
      getElementsByTagName("h3", [a])[0] || getElementsByTagName("h2", [a])[0];
    let title = textContent(heading || a)
      .replace(/\s+/g, " ")
      .trim();
    const job = lead(key, target);
    const classes = (e: Element, name: string) =>
      (e.attribs.class || "").split(/\s+/).includes(name);
    if (key === "linkedin" && a.parent) {
      const card = [a.parent];
      const field = (name: string) =>
        text(textContent(findAll((e) => classes(e, name), card)[0] || []));
      title = field("base-search-card__title") || title;
      job.company = field("base-search-card__subtitle") || "Not listed";
      job.location = field("job-search-card__location");
      job.publishedAt = sourceDate(
        getElementsByTagName("time", card)[0]?.attribs.datetime,
      );
    }
    if (key === "tryremote") {
      const spans = a.children.filter(
        (e): e is Element => e.type === "tag" && e.name === "span",
      );
      if (spans.length === 2) {
        job.company = textContent(spans[0])
          .replace(/is hiring\s*$/, "")
          .trim();
        title = textContent(spans[1]).trim();
      }
    }
    if (key === "remotegamejobs") {
      title =
        text(textContent(getElementsByTagName("strong", [a])[0] || [])) ||
        title;
      job.company =
        text(textContent(getElementsByTagName("small", [a])[0] || [])) ||
        "Not listed";
      job.arrangement = "Remote";
    }
    if (key === "remotecom" && a.parent) {
      const sibling = a.parent.children.find(
        (e) => e.type === "tag" && e.name === "span",
      );
      job.company = sibling ? text(textContent(sibling)) : "Not listed";
    }
    job.title = /^(?:view job|apply|learn more|details)$/i.test(title)
      ? "Job opening"
      : title.slice(0, 400) || "Job opening";
    add(job);
  }
  if (key === "hiredly" && Array.isArray(page.jobs) && page.jobs.length >= 30) {
    const next = new URL(url);
    next.searchParams.set(
      "page",
      String(Number(next.searchParams.get("page") || 0) + 1),
    );
    return { jobs: [...jobs.values()], next: next.href };
  }
  const board = boardFor(key);
  const pageUrls = links
    .flatMap((a) => {
      try {
        const target = new URL(a.attribs.href, url),
          current = new URL(url);
        const paging = board.paging || "page";
        if (
          target.origin !== current.origin ||
          target.pathname !== current.pathname ||
          !target.searchParams.has(paging)
        )
          return [];
        const value = Number(target.searchParams.get(paging)),
          currentValue = Number(
            current.searchParams.get(paging) || (paging === "start" ? 0 : 1),
          );
        if (value <= currentValue || !Number.isFinite(value)) return [];
        // Pagination links sometimes omit the active query. Preserve the seed filters.
        for (const [key, value] of current.searchParams)
          if (key !== paging && !target.searchParams.has(key))
            target.searchParams.set(key, value);
        return [{ url: target.href, value }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.value - b.value);
  if (!jobs.size && !(key === "hiredly" && Array.isArray(page.jobs)))
    throw new BoardUnavailableError(
      "No readable vacancy listings were returned. The page may require a browser, sign-in, or an updated adapter.",
    );
  return { jobs: [...jobs.values()], next: pageUrls[0]?.url || null };
}
export function parseBoardDetail(
  key: string,
  html: string,
  candidate: IncomingJob,
): IncomingJob {
  const { root, data, page } = document(html);
  if (key === "hiredly") {
    const job = page.job && hiredlyJob(page.job);
    if (!job || job.url !== candidate.url || job.descriptionQuality !== "full")
      throw new BoardUnavailableError(
        "The Hiredly page did not contain the matching full description.",
      );
    return job;
  }
  const candidates = data.filter((j) => {
    if (j.isAccessibleForFree === false) return false;
    const canonical = j.url || j["@id"];
    if (canonical) {
      const target = jobUrl(key, canonical);
      return target !== null && itemId(key, target) === candidate.sourceItemId;
    }
    const pageCanonical = getElementsByTagName("link", root.children).find(
      (e) => e.attribs.rel === "canonical",
    )?.attribs.href;
    if (pageCanonical && jobUrl(key, pageCanonical) !== candidate.url)
      return false;
    return data.length === 1;
  });
  if (candidates.length !== 1)
    throw new BoardUnavailableError(
      "The page did not contain an identifiable job description.",
    );
  const job = schemaJob(key, candidate.url, candidates[0]);
  // These publishers truncate JSON-LD independently of the visible description.
  const selectors: Record<string, (e: Element) => boolean> = {
    wantedly: (e) =>
      e.name === "section" &&
      (e.attribs.class || "").includes("ProjectDescription__Section"),
    relocate: (e) =>
      (e.attribs.class || "").split(/\s/).includes("job-info__description"),
    tryremote: (e) =>
      (e.attribs.class || "").split(/\s/).includes("job-description"),
    nofluff: (e) =>
      [
        "posting-requirements",
        "posting-tasks",
        "posting-description",
        "posting-specs",
        "posting-steps",
        "posting-equipment",
        "posting-benefits",
      ].includes(e.attribs.id),
    cake: (e) =>
      (e.attribs.class || "").includes("JobDescriptionBlock-") &&
      (e.attribs.class || "").includes("__content"),
  };
  if (selectors[key]) {
    const sections = findAll(selectors[key], root.children);
    const body = sections
      .map((s) => text(getOuterHTML(s)))
      .filter(Boolean)
      .join("\n\n");
    if (body.length > job.description.length) {
      job.description = body;
      job.descriptionQuality = "full";
    }
  }
  if (!job.title || job.title === "Job opening" || job.description.length < 100)
    throw new BoardUnavailableError(
      "A complete job description was not available on this page.",
    );
  job.description = retainHiringLocations(job.description, candidates[0]);
  return job;
}
