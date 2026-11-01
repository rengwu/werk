import type { Profile, Criteria } from './profile.ts';
import type { ProfileReadiness } from '../backend/profile/facts.ts';
import type { ProfileVersion } from '../backend/profile/store.ts';
import type { AiState, Task, Attachment, AssistantContext, ChatState, SendMode } from './ai.ts';
import type { JobRecord,JobFilter,JobsList,JobStatus,SourceRecord,ScanState } from './jobs.ts';
import type {LetterState,LetterVersion,CvState} from './documents.ts';
export type Theme = 'system' | 'light' | 'dark';
export type Settings = { appearance: Theme; scanInterval:0|4|12 };
export type UpdateState = { checkedAt: string | null; state: 'unchecked' | 'current' | 'available' | 'unavailable'; version?: string; url?: string };
export type Diagnostics = {
  version: string; electron: string; chromium: string; node: string; sqlite: string;
  fts5: boolean; schema: number; databaseBytes: number; system: string; dataFolder: string;
  model:string;reasoning:string;modelWork:string;compiler:string;lastScanAt:string|null;nextScanAt:string|null;
  backend: 'running'; startedAt: string; restartCount: number; update: UpdateState;
  events: Array<{ at: string; level: string; scope: string; message: string }>;
};
export interface Api {
  'backup.export': (params:undefined) => FileDownload;
  'backup.restore': (params:{bytes:Uint8Array}) => {jobs:number;letters:number};
  'settings.get': (params: undefined) => Settings;
  'settings.set': (params: { appearance?: Theme; scanInterval?:0|4|12 }) => Settings;
  'diagnostics.get': (params: undefined) => Diagnostics;
  'update.get': (params: undefined) => UpdateState;
  'profile.get': (params: undefined) => { profile: Profile; readiness: ProfileReadiness; versions: ProfileVersion[] };
  'profile.edit': (params: { section: string; value: unknown; expectedRevision: number }) => Profile;
  'profile.restore': (params: { revision: number; expectedRevision: number }) => Profile;
  'profile.overlap': (params: { criteria: Criteria }) => Array<{ code: string; name: string; hours: number }>;
  'ai.get': (params: undefined) => { connection: AiState; tasks: Task[]; paused: string };
  'ai.login': (params: undefined) => AiState;
  'ai.callback': (params: { value: string }) => boolean;
  'ai.cancel': (params: undefined) => boolean;
  'ai.logout': (params: undefined) => boolean;
  'tasks.retry': (params: { id: number }) => boolean;
  'tasks.stop': (params: { id: number }) => boolean;
  'assistant.get': (params: undefined) => ChatState;
  'assistant.send': (params: { text: string; attachments: string[]; context: AssistantContext; clientId: string; mode?: SendMode }) => number;
  'assistant.stop': (params: undefined) => boolean;
  'assistant.new': (params: undefined) => ChatState;
  'attachments.add': (params: { name: string; bytes: Uint8Array }) => Attachment;
  'attachments.remove': (params: { id: string }) => boolean;
  'sources.get': (params:undefined) => SourceRecord[];
  'sources.enable': (params:{id:number;enabled:boolean}) => SourceRecord[];
  'sources.add': (params:{value:string;name?:string;kind?:'greenhouse'|'ashby'|'lever'|'rss'|'catalog'}) => SourceRecord[];
  'scan.get': (params:undefined) => ScanState;
  'scan.start': (params:{id?:number}) => ScanState;
  'jobs.list': (params:JobFilter) => JobsList;
  'jobs.get': (params:{id:number}) => JobRecord;
  'jobs.open': (params:{id:number}) => JobRecord;
  'jobs.status': (params:{id:number;status:JobStatus}) => JobRecord;
  'jobs.notes': (params:{id:number;notes:string}) => JobRecord;
  'jobs.description': (params:{id:number;description:string}) => JobRecord|null;
  'jobs.hideCompany': (params:{id:number}) => boolean;
  'letters.get': (params:{id:number}) => LetterState;
  'letters.edit': (params:{id:number;body:string;expectedVersion:number}) => LetterVersion;
  'letters.restore': (params:{id:number;version:number;expectedVersion:number}) => LetterVersion;
  'letters.generate': (params:{id:number}) => number;
  'cv.get': (params:undefined) => CvState;
  'cv.generate': (params:{expectedVersion:number}) => CvState;
  'cv.edit': (params:{source:string;expectedVersion:number}) => CvState;
  'cv.restore': (params:{version:number;expectedVersion:number}) => CvState;
  'cv.compile': (params:{version:number}) => CvState;
  'cv.pdf': (params:{version:number}) => Uint8Array;
}
export interface Events { settings: undefined; update: UpdateState; profile: undefined; assistant: undefined; tasks: undefined; ai: undefined; sources:undefined; scan:undefined; jobs:undefined; letters:undefined; cv:undefined }
export type ApiResult<K extends keyof Api> = ReturnType<Api[K]>;
export type ApiParams<K extends keyof Api> = Parameters<Api[K]>[0];
export type Request = { id: number; method: keyof Api; params: unknown };
export type BackendInit = {
  type: 'init'; dataDir: string; version: string; system: string; electron: string; chromium: string;
  restartCount: number; previousExit?: number;
};
export type FileDownload = { name: string; bytes: Uint8Array };
declare global {
  const WERK_TEST_BUILD: boolean;
  interface Window {
    werk: { platform: string; connect(): void; setTheme(mode: Theme): void; saveFile(file: FileDownload): Promise<boolean>; copyText(text: string): Promise<void> };
  }
}
