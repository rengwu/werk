import type { Profile, Criteria } from './profile.ts';
import type { ProfileReadiness } from '../backend/profile/facts.ts';
import type { ProfileVersion } from '../backend/profile/store.ts';
import type { AiState, Task, Attachment, AssistantContext, ChatState } from './ai.ts';
export type Theme = 'system' | 'light' | 'dark';
export type Settings = { appearance: Theme };
export type UpdateState = { checkedAt: string | null; state: 'unchecked' | 'current' | 'available' | 'unavailable'; version?: string; url?: string };
export type Diagnostics = {
  version: string; electron: string; chromium: string; node: string; sqlite: string;
  fts5: boolean; schema: number; databaseBytes: number; system: string; dataFolder: string;
  backend: 'running'; startedAt: string; restartCount: number; update: UpdateState;
  events: Array<{ at: string; level: string; scope: string; message: string }>;
};
export interface Api {
  'settings.get': (params: undefined) => Settings;
  'settings.set': (params: { appearance: Theme }) => Settings;
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
  'assistant.send': (params: { text: string; attachments: string[]; context: AssistantContext; clientId: string }) => number;
  'assistant.new': (params: undefined) => ChatState;
  'attachments.add': (params: { name: string; bytes: Uint8Array }) => Attachment;
  'attachments.remove': (params: { id: string }) => boolean;
}
export interface Events { settings: undefined; update: UpdateState; profile: undefined; assistant: undefined; tasks: undefined; ai: undefined }
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
    werk: { platform: string; connect(): void; setTheme(mode: Theme): void; saveFile(file: FileDownload): Promise<boolean> };
  }
}
