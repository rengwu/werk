import { z } from 'zod';
import type { assessJob } from '../backend/matching/matching.ts';
export type Assessment = ReturnType<typeof assessJob> & { availability: 'open'|'unknown'|'closed'; freshness: 'recent'|'stale'|'unknown'; qualityNotes: string[] };
export type JobStatus = 'new'|'skipped'|'saved'|'applied';
export type JobRecord = {
  id:number; url:string; company:string; title:string; location:string; countries:string[];
  arrangement:'remote'|'hybrid'|'onsite'|null; salary:string|null; description:string; descriptionComplete:boolean;
  postedAt:string|null; firstSeenAt:string; lastSeenAt:string; closedAt:string|null;
  matchLevel:'strong'|'adjacent'|'stretch'|'other'; matchScore:number; eligibility:'possible'|'review'|'incompatible';
  overlapHours:number|null; assessment:Assessment; profileRevision:number; status:JobStatus;
  openedAt:string|null; savedAt:string|null; appliedAt:string|null; notes:string; savedDescription:string|null; duplicateOf:number|null;
  sources:Array<{name:string;url:string;checkedAt:string}>;
  letterState?:string;
};
export const jobFilterSchema = z.object({
  view: z.enum(['new', 'all', 'saved', 'skipped']),
  search: z.string().max(500).optional(),
  level: z.enum(['strong', 'adjacent']).optional(),
  arrangement: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  locations: z.array(z.string().min(1).max(1500)).max(50).optional(),
  days: z.number().int().min(1).max(365).optional(),
  savedStatus: z.enum(['saved', 'applied']).optional(),
  sort: z.enum(['match', 'discovered', 'saved']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
}).strict();
export type JobFilter = z.infer<typeof jobFilterSchema>;
export type JobsList = {jobs:JobRecord[];total:number;newCount:number;savedCount:number;countries:string[]};
export type SourceRecord = {id:number;kind:string;identifier:string;name:string;enabled:boolean;lastScanAt:string|null;lastResult:string|null;lastError:string|null;nextScanAt:string|null;kept:number;saved:number};
export type ScanState = {running:boolean;source:string|null;requests:number;kept:number;lastScanAt:string|null;nextScanAt:string|null;firstScanCompleted:boolean};
