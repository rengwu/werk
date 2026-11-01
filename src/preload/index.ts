import { contextBridge, ipcRenderer } from 'electron';
import type { FileDownload, Theme } from '../shared/api.ts';
ipcRenderer.on('werk:backend-port', event => window.postMessage({ type: 'werk:backend-port' }, '*', event.ports));
ipcRenderer.on('werk:backend-status', (_event, data) => window.postMessage({ type: 'werk:backend-status', ...data }, '*'));
contextBridge.exposeInMainWorld('werk', {
  platform: process.platform,
  connect: () => ipcRenderer.send('werk:connect'),
  setTheme: (mode: Theme) => ipcRenderer.send('werk:theme', mode),
  saveFile: (file: FileDownload) => ipcRenderer.invoke('werk:save-file', file),
  copyText: (text: string) => ipcRenderer.invoke('werk:copy-text', text),
  factoryReset: () => ipcRenderer.invoke('werk:factory-reset'),
});
