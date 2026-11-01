import { z } from "zod";
export type { Profile } from "../../shared/profile.ts";
export type ReviewStatus = "new" | "saved" | "skipped" | "applied";
export type MatchCategory = "strong" | "adjacent" | "stretch" | "other";
export type Job = {
  id: string;
  sourceId: string;
  sourceItemId: string;
  sourceName: string;
  sourceType: string;
  title: string;
  company: string;
  location: string;
  locationScope?: "listed" | "hiring";
  arrangement: string;
  employmentType: string;
  salary: string;
  url: string;
  description: string;
  descriptionQuality?: "full" | "excerpt" | "unknown";
  descriptionSource?: { name: string; url: string; checkedAt: string };
  canLoadDescription?: boolean;
  applicationUrl?: string;
  publishedAt: string | null;
  expiresAt?: string | null;
  /** Observed HTTP removal, distinct from an employer's expiry date. */
  removedAt?: string | null;
  firstSeenAt: string;
  /** First deliberate user open, distinct from the collector's firstSeenAt. */
  lastSeenAt: string;
  contentHash: string;
  kind: "opening" | "lead";
  availability: "open" | "unknown" | "closed";
  category: MatchCategory;
  score: number;
  reasons: string[];
  gaps: string[];
  eligibility: "unknown" | "review" | "incompatible";
  eligibilityNotes: string[];
  eligibilityEvidence?: {
    rule: string;
    text: string;
    outcome: "review" | "incompatible";
    source: "description" | "location";
  }[];
  remoteEligibility?: "possible" | "restricted" | "unknown";
  matchVersion?: number;
  matchScoreCap?: number;
  matchProfileRevision?: number;
  matchBreakdown?: { label: string; points: number }[];
  matchedEvidence?: {
    technology: string;
    basis: "professional" | "project";
    ids: string[];
  }[];
  freshness?: "recent" | "stale" | "unknown";
  qualityNotes?: string[];
  contentChangedAt?: string;
  duplicateOf?: string;
  duplicateReason?: string;
  relatedListings?: {
    id: string;
    name: string;
    url: string;
    status: ReviewStatus;
  }[];
  status: ReviewStatus;
  notes: string;
  descriptionOverride?: string;
  savedAt: string | null;
  coverLetterState?: string | null;
  coverLetterId?: string | null;
  sourceLinks?: { name: string; url: string }[];
};
export type IncomingJob = Pick<
  Job,
  | "sourceItemId"
  | "title"
  | "company"
  | "location"
  | "locationScope"
  | "arrangement"
  | "employmentType"
  | "salary"
  | "url"
  | "description"
  | "descriptionQuality"
  | "descriptionSource"
  | "applicationUrl"
  | "publishedAt"
  | "expiresAt"
  | "removedAt"
  | "kind"
>;
export const sourceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum([
    "ashby",
    "greenhouse",
    "lever",
    "rss",
    "himalayas",
    "remoteok",
    "workingnomads",
    "remotive",
    "fourdayweek",
    "arbeitnow",
    "jobicy",
    "public_board",
  ]),
  identifier: z.string().trim().min(1).max(1500),
  enabled: z.boolean().default(true),
  requestLimit: z.number().int().min(1).max(100).default(30),
  intervalHours: z.number().min(4).max(168).optional(),
});
export type Source = z.infer<typeof sourceInputSchema> & {
  id: string;
  state: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  retryAt?: string | null;
  lastError: string | null;
  jobCount: number;
  checkpoint: Record<string, unknown>;
};
