import type { IncomingJob, Job } from "../sources/types.ts";
export const authoritativeSources = new Set(["ashby", "greenhouse", "lever"]);
export type Observation = {
  sourceId: string;
  sourceType: string;
  sourceName: string;
  item: IncomingJob;
  firstSeenAt: string;
  checkedAt: string;
  changedAt: string;
  missingAt: string | null;
};
export function descriptionQuality(
  item: Pick<IncomingJob, "description" | "descriptionQuality" | "kind">,
): NonNullable<Job["descriptionQuality"]> {
  if (!item.description.trim()) return "unknown";
  if (item.descriptionQuality) return item.descriptionQuality;
  return item.kind === "opening" ? "full" : "excerpt";
}
export function descriptionRank(
  item: Pick<IncomingJob, "description" | "descriptionQuality" | "kind">,
  sourceType: string,
): number {
  if (!item.description.trim()) return 0;
  const quality = descriptionQuality(item);
  return (
    (quality === "full" ? 1000000 : quality === "unknown" ? 100000 : 10000) +
    (authoritativeSources.has(sourceType) ? 100000 : 0) +
    Math.min(item.description.length, 90000)
  );
}
export function preserveDescription(
  previous: Readonly<IncomingJob>,
  incoming: Readonly<IncomingJob>,
): IncomingJob {
  // An omitted expiry is not evidence that a previously expired feed entry reopened.
  if (
    previous.expiresAt &&
    !incoming.expiresAt &&
    !(
      incoming.publishedAt &&
      Date.parse(incoming.publishedAt) > Date.parse(previous.expiresAt)
    )
  )
    incoming = { ...incoming, expiresAt: previous.expiresAt };
  const oldQuality = descriptionQuality(previous),
    newQuality = descriptionQuality(incoming);
  const removedAt =
    incoming.removedAt !== undefined
      ? incoming.removedAt
      : newQuality === "full"
        ? null
        : previous.removedAt;
  // A newer full description can legitimately be shorter. Empty bodies and excerpts cannot erase it.
  if (
    previous.description &&
    (!incoming.description.trim() ||
      (oldQuality === "full" && newQuality !== "full"))
  )
    return {
      ...incoming,
      // Full-detail metadata stays authoritative through listing-card refreshes.
      ...(oldQuality === "full" ? previous : {}),
      sourceItemId: incoming.sourceItemId,
      url: incoming.url,
      expiresAt: incoming.expiresAt,
      removedAt,
      description: previous.description,
      descriptionQuality: oldQuality,
      descriptionSource: previous.descriptionSource,
      kind: previous.kind,
    };
  return { ...incoming, descriptionQuality: newQuality, removedAt };
}
// Stable source content, excluding observation times. Raw observations remain in
// history, including excerpts; receipt time alone must not manufacture a version.
export function sourceContent(item: Readonly<IncomingJob>): string {
  const { descriptionSource, removedAt, ...content } = item;
  const fields = {
    ...content,
    removed: !!removedAt,
    descriptionSource: descriptionSource
      ? { name: descriptionSource.name, url: descriptionSource.url }
      : undefined,
  };
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(fields)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}
const DAY = 86400000;
export function listingQuality(
  job: Job,
  observations: Observation[],
  timestamp = Date.now(),
): Required<Pick<Job, "availability" | "freshness" | "qualityNotes">> {
  const notes: string[] = [];
  const available = (o: Observation) =>
    !o.missingAt &&
    !o.item.removedAt &&
    !(o.item.expiresAt && Date.parse(o.item.expiresAt) <= timestamp);
  const current = (o: Observation) => {
    const authoritative = authoritativeSources.has(o.sourceType);
    if (timestamp - Date.parse(o.checkedAt) > (authoritative ? 14 : 30) * DAY)
      return false;
    if (authoritative) return true;
    const date = o.item.publishedAt || o.firstSeenAt;
    return (
      timestamp - Date.parse(date) <=
      90 *
        DAY
    );
  };
  const official = observations.filter((o) =>
    authoritativeSources.has(o.sourceType),
  );
  let availability: Job["availability"] = "unknown";
  if (official.length && official.every((o) => !available(o))) {
    availability = "closed";
    notes.push(
      "No longer listed in a complete employer-board snapshot, or explicitly expired. A feed copy cannot reopen it.",
    );
  } else if (observations.length && observations.every((o) => !available(o))) {
    availability = "closed";
    notes.push(
      "All observed listings have explicitly expired or been removed.",
    );
  } else if (
    (official.length ? official : observations).some(
      (o) => available(o) && current(o),
    )
  )
    availability = "open";
  const freshness =
    availability === "open"
      ? "recent"
      : observations.some(available)
        ? "stale"
        : "unknown";
  if (freshness === "stale")
    notes.push(
      "This listing is old or has not been checked recently. Continued feed presence does not confirm that it is still hiring.",
    );
  if (descriptionQuality(job) !== "full")
    notes.push(
      "Only an excerpt or hiring post is available. Add a complete description before generating a cover letter.",
    );
  return { availability, freshness, qualityNotes: notes };
}
export function selectContent(
  observations: Observation[],
): Observation | undefined {
  return [...observations].sort(
    (a, b) =>
      descriptionRank(b.item, b.sourceType) -
        descriptionRank(a.item, a.sourceType) ||
      Date.parse(b.changedAt) - Date.parse(a.changedAt),
  )[0];
}
