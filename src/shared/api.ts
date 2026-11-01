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
}
export interface Events { settings: undefined; update: UpdateState }
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
