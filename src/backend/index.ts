import { z } from 'zod';
import type { MessagePortMain } from 'electron';
import type { BackendInit, Request } from '../shared/api.ts';
import { Service } from './service.ts';
import { checkUpdate } from './update.ts';

const parent = process.parentPort;
if (!parent) throw new Error('werk backend must run as a utility process.');
const ports = new Set<MessagePortMain>();
let service: Service;
let initialTimer: ReturnType<typeof setTimeout>;
let updateTimer: ReturnType<typeof setInterval>;
const requestSchema = z.object({ id: z.number().int().nonnegative(), method: z.string().max(100), params: z.unknown().optional() });
parent.on('message', ({ data, ports: incoming }) => {
  if (data.type === 'init') {
    service = new Service(data as BackendInit, (event, value) => { for (const port of ports) port.postMessage({ event, data: value }); });
    const update = async () => {
      const state = await checkUpdate(data.version, WERK_TEST_BUILD ? process.env.WERK_RELEASES_URL : undefined);
      service.store.set('update', state); service.emit('update', state);
    };
    initialTimer = setTimeout(() => void update(), WERK_TEST_BUILD ? 100 : 30000);
    updateTimer = setInterval(() => void update(), 12 * 60 * 60 * 1000);
    parent.postMessage({ type: 'ready' });
  } else if (data.type === 'connect' && service) {
    const port = incoming[0]; if (!port) return;
    ports.add(port); port.on('close', () => ports.delete(port));
    port.on('message', async ({ data: raw }) => {
      const parsed = requestSchema.safeParse(raw); if (!parsed.success) return;
      const request = parsed.data as Request;
      try { port.postMessage({ id: request.id, result: await service.call(request.method, request.params as never) }); }
      catch (error) {
        const message = error instanceof z.ZodError ? 'Invalid input.' : error instanceof Error ? error.message : 'The action failed.';
        port.postMessage({ id: request.id, error: { message, code: error instanceof z.ZodError ? 'INVALID_INPUT' : 'FAILED' } });
      }
    });
    port.start();
  } else if (data.type === 'shutdown') {
    clearTimeout(initialTimer); clearInterval(updateTimer); service?.close(); process.exit(0);
  }
});
