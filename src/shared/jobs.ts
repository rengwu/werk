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
export type JobFilter = { view:'new'|'all'|'saved';search?:string;level?:'strong'|'adjacent';arrangement?:'remote'|'hybrid'|'onsite';country?:string;days?:number;limit?:number;offset?:number };
export type JobsList = {jobs:JobRecord[];total:number;newCount:number;savedCount:number;countries:string[]};
export type SourceRecord = {id:number;kind:string;identifier:string;name:string;enabled:boolean;lastScanAt:string|null;lastResult:string|null;lastError:string|null;nextScanAt:string|null;kept:number;saved:number};
export type ScanState = {running:boolean;source:string|null;requests:number;kept:number;lastScanAt:string|null;nextScanAt:string|null;firstScanCompleted:boolean};
