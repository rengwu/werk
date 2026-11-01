import type { IncomingJob, Source } from "./types.ts";
import { readUrl, type FetchContext } from "../http.ts";
import { collectPublicBoard } from "./boards/collector.ts";
import { htmlText, sourceDate as dateOrNull } from "./source-text.ts";
import { collectDiscovery, normalizeRss } from "./discovery.ts";
export { htmlText } from "./source-text.ts";

type AnyRecord = Record<string, any>;
const asArray = <T>(value: T | T[] | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const defaults = {
  arrangement: "Unspecified",
  employmentType: "Unspecified",
  salary: "",
  publishedAt: null,
  kind: "opening" as const,
  descriptionQuality: "full" as const,
};
export function normalizeAshby(data: AnyRecord, source: Source): IncomingJob[] {
  if (!Array.isArray(data.jobs))
    throw new Error("Unexpected Ashby response: missing jobs array.");
  return data.jobs
    .filter((j: AnyRecord) => j.isListed !== false)
    .map((j: AnyRecord) => ({
      ...defaults,
      sourceItemId: j.id || new URL(j.jobUrl).pathname.split("/").at(-1),
      title: j.title,
      company: source.name,
      location: [
        j.location,
        ...(j.secondaryLocations || []).map((l: AnyRecord) => l.location),
      ]
        .filter(Boolean)
        .join(" · "),
      arrangement: j.workplaceType || (j.isRemote ? "Remote" : "Unspecified"),
      employmentType: j.employmentType || "Unspecified",
      salary:
        j.compensation?.scrapeableCompensationSalarySummary ||
        j.compensation?.compensationTierSummary ||
        "",
      url: j.jobUrl,
      applicationUrl: j.applyUrl,
      description: j.descriptionPlain || htmlText(j.descriptionHtml || ""),
      publishedAt: dateOrNull(j.publishedAt),
    }));
}
export function normalizeGreenhouse(
  data: AnyRecord,
  source: Source,
): IncomingJob[] {
  if (!Array.isArray(data.jobs))
    throw new Error("Unexpected Greenhouse response: missing jobs array.");
  return data.jobs.map((j: AnyRecord) => ({
    ...defaults,
    sourceItemId: String(j.id),
    title: j.title,
    company: source.name,
    location: j.location?.name || "",
    arrangement: /remote/i.test(j.location?.name || "")
      ? "Remote"
      : "Unspecified",
    url: j.absolute_url,
    description: htmlText(j.content || ""),
    publishedAt: dateOrNull(j.first_published),
  }));
}
export async function collect(
  source: Source,
  ctx: FetchContext,
  emit: (job: IncomingJob) => void,
  checkpoint: (value: Record<string, unknown>) => void,
  read: typeof readUrl = readUrl,
): Promise<void> {
  const readJson = async <T>(url:string, context:FetchContext):Promise<T> => JSON.parse(await read(url,context));
  const identifier = encodeURIComponent(source.identifier);
  if (source.type === "ashby") {
    const data = await readJson<AnyRecord>(
      `https://api.ashbyhq.com/posting-api/job-board/${identifier}?includeCompensation=true`,
      ctx,
    );
    for (const job of normalizeAshby(data, source)) emit(job);
    return;
  }
  if (source.type === "greenhouse") {
    const data = await readJson<AnyRecord>(
      `https://boards-api.greenhouse.io/v1/boards/${identifier}/jobs?content=true`,
      ctx,
    );
    for (const job of normalizeGreenhouse(data, source)) emit(job);
    return;
  }
  if (source.type === "lever") {
    const pageSize = 100;
    let skip = Number(source.checkpoint.skip || 0);
    const cycleStartedAt = String(
      source.checkpoint.cycleStartedAt || new Date().toISOString(),
    );
    ctx.snapshotStartedAt = cycleStartedAt;
    checkpoint({ skip, cycleStartedAt });
    while (true) {
      const jobs = await readJson<AnyRecord[]>(
        `https://api.lever.co/v0/postings/${identifier}?mode=json&limit=${pageSize}&skip=${skip}`,
        ctx,
      );
      if (!Array.isArray(jobs)) throw new Error("Unexpected Lever response.");
      for (const j of jobs)
        emit({
          ...defaults,
          sourceItemId: j.id,
          title: j.text,
          company: source.name,
          location: j.categories?.location || "",
          arrangement: j.workplaceType || "Unspecified",
          employmentType: j.categories?.commitment || "Unspecified",
          salary: j.salaryRange
            ? `${j.salaryRange.currency} ${j.salaryRange.min}–${j.salaryRange.max} / ${j.salaryRange.interval}`
            : "",
          url: j.hostedUrl,
          applicationUrl: j.applyUrl,
          description: [
            htmlText(j.description || ""),
            ...(j.lists || []).map(
              (l: AnyRecord) => `${l.text}\n${htmlText(l.content || "")}`,
            ),
            htmlText(j.additional || ""),
          ].join("\n\n"),
        });
      if (jobs.length < pageSize) {
        checkpoint({});
        break;
      }
      skip += jobs.length;
      checkpoint({ skip, cycleStartedAt });
    }
    return;
  }
  if (source.type === "rss") {
    const xml = await read(source.identifier, ctx);
    if (xml) for (const job of normalizeRss(xml, source)) emit(job);
    return;
  }
  if (source.type === "public_board")
    return collectPublicBoard(source, ctx, emit, checkpoint, read);
  return collectDiscovery(source, ctx, emit, checkpoint, readJson);
}
