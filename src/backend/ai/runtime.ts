import { readFile } from 'node:fs/promises';
import { createModels, openaiProvider } from './pi-sdk.ts';
import { createCredentialStore } from './credentials.ts';
import { MODEL } from '../../shared/ai.ts';
import type { AiState, InferenceImage } from '../../shared/ai.ts';

export class AiUnavailable extends Error {}
export function inferenceError(message: string) {
  if (/subscription_sharing_usage_limit|usage.limit|rate.limit|allowance|quota|429/i.test(message)) return 'Your ChatGPT subscription allowance is unavailable. Retry after it resets.';
  if (/model.*(?:not|unavail|access)|model_not_found/i.test(message)) return 'The requested model is unavailable through this ChatGPT subscription. No fallback was used.';
  if (/401|403|auth|token|credential|sign.in/i.test(message)) return 'The ChatGPT connection is unavailable. Sign in again in Settings → AI.';
  return 'The model request did not complete. Check the ChatGPT connection and retry.';
}
export class AiRuntime {
  auth: ReturnType<typeof createCredentialStore>;
  models: ReturnType<typeof createModels>;
  state: AiState = { state: 'signed_out', model: MODEL, reasoning: 'high' };
  notify: () => void;
  connected: () => void = () => {};
  controller?: AbortController;
  active?: Promise<void>;
  manual?: (value: string) => void;
  fake = typeof WERK_TEST_BUILD !== 'undefined' && WERK_TEST_BUILD && process.env.WERK_FAKE_AI === '1';
  constructor(dataDir: string, notify: () => void) {
    this.auth = createCredentialStore(dataDir); this.notify = notify;
    this.models = createModels({ credentials: this.auth.credentials, authContext: { env: async () => undefined, fileExists: async () => false } });
    const provider = openaiProvider(); delete provider.auth!.apiKey; this.models.setProvider(provider);
  }
  async status() {
    if (this.fake) return { ...this.state, state: 'connected' as const };
    if (this.state.state !== 'connecting' && this.state.state !== 'unavailable') {
      try { this.state.state = await this.auth.credentials.read('openai') ? 'connected' : 'signed_out'; }
      catch { this.state = { ...this.state, state: 'unavailable', message: 'Cannot read the saved ChatGPT connection. Sign in again.' }; }
    }
    return this.state;
  }
  login() {
    if (this.active) return this.state;
    this.controller = new AbortController();
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(900000)]);
    this.state = { state: 'connecting', model: MODEL, reasoning: 'high' }; this.notify();
    this.active = (async () => {
      try {
        const id = await this.auth.hostId();
        await this.models.login('openai', 'oauth', {
          signal,
          notify: event => {
            if (event.type !== 'auth_url') return;
            const url = new URL(event.url);
            if (url.protocol !== 'https:' || url.hostname !== 'auth.openai.com') throw new Error('Unexpected sign-in destination.');
            this.state = { ...this.state, url: event.url, manual: true }; this.notify();
          },
          prompt: prompt => {
            if (prompt.type !== 'manual_code') return Promise.reject(new Error('Unsupported sign-in prompt.'));
            return new Promise((resolve, reject) => {
              this.manual = resolve;
              const cancel = () => { this.manual = undefined; reject(new Error('Cancelled')); };
              const cancellation = prompt.signal || signal;
              if (cancellation.aborted) cancel(); else cancellation.addEventListener('abort', cancel, { once: true });
            });
          },
        }, { agentName: 'werk', getDeviceId: () => id });
        this.state = { state: 'connected', model: MODEL, reasoning: 'high' }; this.connected();
      } catch (error) {
        this.state = { state: 'unavailable', model: MODEL, reasoning: 'high', message: signal.aborted ? 'Sign-in was cancelled or timed out. Try again.' : /Port 1455/.test(String(error)) ? 'Another sign-in is using port 1455. Finish or cancel it, then try again.' : 'ChatGPT sign-in failed. Try again.' };
      } finally { this.controller = undefined; this.manual = undefined; this.active = undefined; this.notify(); }
    })();
    return this.state;
  }
  callback(value: string) { if (!this.manual) throw new Error('Start Sign in with ChatGPT first.'); this.manual(value); this.manual = undefined; }
  async cancel() { this.controller?.abort(); await this.active; }
  async logout() { await this.cancel(); await this.auth.credentials.delete('openai'); this.state = { state: 'signed_out', model: MODEL, reasoning: 'high' }; this.notify(); }
  async infer<T>(instructions: string, data: unknown, schema: object, signal: AbortSignal, images: InferenceImage[] = []): Promise<T> {
    signal.throwIfAborted();
    if (this.fake) {
      const fixtures = JSON.parse(await readFile(process.env.WERK_AI_FIXTURES!, 'utf8')) as Array<{ when: string; result?: unknown; error?: string }>;
      const message = typeof data === 'object' && data && 'message' in data ? JSON.stringify(data.message) : JSON.stringify(data);
      const fixture = fixtures.find(f => message.includes(f.when));
      if (!fixture) throw new Error('No simulated inference fixture matches.');
      if (fixture.error) throw new AiUnavailable(fixture.error);
      return structuredClone(fixture.result) as T;
    }
    if (!(await this.auth.credentials.read('openai'))) throw new AiUnavailable('Sign in with ChatGPT in Settings → AI.');
    const model = this.models.getModel('openai', MODEL);
    if (!model) throw new AiUnavailable('The requested model is unavailable through this ChatGPT subscription. No fallback was used.');
    try {
      const answer = await this.models.complete(model, { systemPrompt: instructions, messages: [{ role: 'user', timestamp: Date.now(), content: [{ type: 'text', text: JSON.stringify(data) }, ...images.map(image => ({ type: 'image' as const, data: image.data, mimeType: image.mediaType }))] }] }, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(240000)]), reasoningEffort: 'high', maxRetries: 0, timeoutMs: 240000,
        onPayload: payload => ({ ...(payload as object), text: { format: { type: 'json_schema', name: 'werk', strict: true, schema } } }),
      });
      signal.throwIfAborted();
      if (answer.stopReason !== 'stop') throw new AiUnavailable(inferenceError(answer.errorMessage || answer.stopReason));
      const blocks = answer.content.filter(p => p.type === 'text');
      const phase = (value?: string) => { try { return JSON.parse(value || 'null')?.phase; } catch { return undefined; } };
      const final = blocks.filter(p => phase(p.textSignature) === 'final_answer');
      if (!final.length && blocks.some(p => phase(p.textSignature) === 'commentary')) throw new Error('No final model response.');
      const text = (final.length ? final : blocks).map(p => p.text).join('\n');
      if (text.length > 2_000_000) throw new Error('Oversized model output.');
      return JSON.parse(text) as T;
    } catch (error) {
      if (signal.aborted) throw new Error('Stopped.');
      const message = error instanceof AiUnavailable ? error.message : inferenceError(String(error));
      this.state = { state: 'unavailable', model: MODEL, reasoning: 'high', message }; this.notify();
      throw new AiUnavailable(message);
    }
  }
}
