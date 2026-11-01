import { QueryClient } from '@tanstack/react-query';
import type { Api, ApiParams, ApiResult } from '../shared/api.ts';
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
let port: MessagePort | null = null;
let sequence = 0;
let connected: () => void;
let ready = new Promise<void>(resolve => { connected = resolve; });
const pending = new Map<number, { resolve: (value: never) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
function disconnect() {
  port?.close(); port = null;
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('The backend restarted. Try again.')); }
  pending.clear(); ready = new Promise(resolve => { connected = resolve; });
}
window.addEventListener('message', event => {
  if (event.source !== window) return;
  if (event.data?.type === 'werk:backend-status') { disconnect(); window.dispatchEvent(new CustomEvent('werk:connection', { detail: event.data })); }
  if (event.data?.type !== 'werk:backend-port' || !event.ports[0]) return;
  if (port) disconnect();
  port = event.ports[0];
  port.onmessage = ({ data }) => {
    if (data.event) { void queryClient.invalidateQueries({ queryKey: [data.event] }); if (data.event === 'update') void queryClient.invalidateQueries({ queryKey: ['diagnostics'] }); return; }
    const item = pending.get(data.id); if (!item) return;
    clearTimeout(item.timer); pending.delete(data.id);
    if (data.error) item.reject(new Error(data.error.message)); else item.resolve(data.result as never);
  };
  port.start(); connected(); void queryClient.invalidateQueries();
  window.dispatchEvent(new CustomEvent('werk:connection', { detail: { state: 'connected' } }));
});
export async function call<K extends keyof Api>(method: K, params: ApiParams<K>): Promise<ApiResult<K>> {
  await ready;
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('The action timed out. Try again.')); }, 30000);
    pending.set(id, { resolve, reject, timer }); port!.postMessage({ id, method, params });
  });
}
window.werk.connect();
