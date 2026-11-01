import { app, BrowserWindow, Menu, MessageChannelMain, Tray, ipcMain, nativeTheme, shell, utilityProcess, dialog, clipboard } from 'electron';
import type { UtilityProcess, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { BackendInit, FileDownload } from '../shared/api.ts';

app.setName('werk');
if (process.env.WERK_DATA_DIR) app.setPath('userData', resolve(process.env.WERK_DATA_DIR));
else app.setPath('userData', join(app.getPath('appData'), app.isPackaged ? 'werk' : 'werk-dev'));
mkdirSync(app.getPath('userData'), { recursive: true, mode: 0o700 });
if (!app.requestSingleInstanceLock()) app.exit(0);

let win: BrowserWindow | null = null;
let backend: UtilityProcess | null = null;
let backendReady = false;
let rendererReady = false;
let stopped = false;
let quitting = false;
let shutdownStarted = false;
let restartCount = 0;
let restarts: number[] = [];
let tray: Tray | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

function crashLog(message: string) {
  const dir = join(app.getPath('userData'), 'logs'); mkdirSync(dir, { recursive: true });
  const file = join(dir, 'main.log');
  try { if (statSync(file).size >= 1024 * 1024) renameSync(file, `${file}.1`); } catch { /* first log */ }
  appendFileSync(file, `${new Date().toISOString()} ${message}\n`);
}
function status(state: string) { win?.webContents.send('werk:backend-status', { state, restartCount, version: app.getVersion() }); }
function startBackend(previousExit?: number) {
  if (backend || shutdownStarted) return;
  backendReady = false;
  const child = utilityProcess.fork(join(__dirname, 'backend.cjs'), [], { serviceName: 'werk-backend', stdio: 'ignore', env: { ...process.env, WERK_RESOURCES_DIR: app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'), WERK_BUNDLE_DIR: __dirname } });
  backend = child;
  child.once('spawn', () => {
    const init: BackendInit = { type: 'init', dataDir: app.getPath('userData'), version: app.getVersion(), system: `${process.platform} ${process.getSystemVersion()} ${process.arch}`, electron: process.versions.electron, chromium: process.versions.chrome, restartCount, previousExit };
    child.postMessage(init);
  });
  child.on('message', (message) => { if (message.type === 'ready') { backendReady = true; connect(); } });
  child.once('exit', (code) => {
    backend = null; backendReady = false;
    if (shutdownStarted) { app.exit(0); return; }
    crashLog(`Backend exited with code ${code}.`);
    restartCount++; restarts = [...restarts.filter(t => Date.now() - t < 60000), Date.now()];
    stopped = restarts.length > 3; status(stopped ? 'failed' : 'restarting');
    if (!stopped) reconnectTimer = setTimeout(() => startBackend(code), 1000);
  });
}
function connect() {
  if (!backendReady || !backend || !win || !rendererReady) return;
  const { port1, port2 } = new MessageChannelMain();
  backend.postMessage({ type: 'connect' }, [port1]);
  win.webContents.postMessage('werk:backend-port', null, [port2]);
}
function openExternal(url: string) {
  try { const parsed = new URL(url); if (['https:', 'http:'].includes(parsed.protocol)) void shell.openExternal(parsed.href); } catch { /* invalid link */ }
}
function showWindow() {
  if (!win) createWindow();
  if (win?.isMinimized()) win.restore();
  win?.show(); win?.focus();
}
function beginShutdown() {
  if (shutdownStarted) return;
  shutdownStarted = true; clearTimeout(reconnectTimer);
  tray?.destroy(); tray = null;
  if (!backend) { app.exit(0); return; }
  backend.postMessage({ type: 'shutdown' });
  setTimeout(() => { backend?.kill(); app.exit(0); }, 3000);
}
function createWindow() {
  rendererReady = false;
  win = new BrowserWindow({ width: 1280, height: 820, minWidth: 900, minHeight: 600, show: false, title: 'werk',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#181818' : '#fcfcfc',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', trafficLightPosition: { x: 14, y: 15 }, autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, plugins: true },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => { event.preventDefault(); openExternal(url); });
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.on('will-prevent-unload', (event) => {
    const discard = dialog.showMessageBoxSync(win!, { type: 'question', buttons: ['Keep editing', 'Discard changes'], defaultId: 0, cancelId: 0, message: 'Discard unsaved changes?' });
    if (discard === 1) event.preventDefault(); else quitting = false;
  });
  win.on('close', (event) => { if (!quitting) { event.preventDefault(); win?.hide(); } });
  win.on('closed', () => { win = null; if (quitting) beginShutdown(); });
  const dev = !app.isPackaged && process.env.WERK_RENDERER_URL;
  void (dev ? win.loadURL(dev) : win.loadFile(join(__dirname, 'renderer/index.html')));
}
function trusted(event: IpcMainEvent | IpcMainInvokeEvent) { return !!win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame; }
ipcMain.on('werk:connect', event => {
  if (!trusted(event)) return;
  rendererReady = true;
  if (stopped) { stopped = false; restarts = []; startBackend(); } else connect();
});
ipcMain.on('werk:theme', (event, mode) => { if (trusted(event) && ['system','light','dark'].includes(mode)) nativeTheme.themeSource = mode; });
ipcMain.handle('werk:save-file', async (event, file: FileDownload) => {
  if (!trusted(event) || !file || typeof file.name !== 'string' || file.name !== basename(file.name) || !/\.(tex|pdf|txt|zip)$/i.test(file.name) || !(file.bytes instanceof Uint8Array) || file.bytes.byteLength > 100 * 1024 * 1024) throw new Error('Invalid download.');
  const result = await dialog.showSaveDialog(win!, { defaultPath: file.name });
  if (result.canceled || !result.filePath) return false;
  await writeFile(result.filePath, file.bytes); return true;
});
ipcMain.handle('werk:copy-text', (event, text: string) => {
  if (!trusted(event) || typeof text !== 'string' || text.length > 2*1024*1024) throw new Error('Invalid clipboard text.');
  return clipboard.writeText(text);
});
app.on('second-instance', showWindow);
app.on('activate', showWindow);
app.on('window-all-closed', () => {});
app.on('before-quit', event => {
  if (shutdownStarted) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  if (win) win.close(); else beginShutdown();
});
void app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'werk', submenu: [{ role: 'about' as const }, { type: 'separator' as const }, { role: 'hide' as const }, { role: 'hideOthers' as const }, { role: 'unhide' as const }, { type: 'separator' as const }, { label: 'Quit werk', accelerator: 'Cmd+Q', click: () => app.quit() }] }] : []),
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ...(process.platform !== 'darwin' ? [{ label: 'File', submenu: [{ label: 'Quit werk', accelerator: 'Alt+F4', click: () => app.quit() }] }] : []),
  ]));
  startBackend(); createWindow();
  if (process.platform === 'win32') {
    tray = new Tray(app.isPackaged ? join(process.resourcesPath, 'tray.png') : join(app.getAppPath(), 'resources/tray.png'));
    tray.setToolTip('werk'); tray.on('click', showWindow);
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open werk', click: showWindow }, { label: 'Quit werk', click: () => app.quit() }]));
  }
});
