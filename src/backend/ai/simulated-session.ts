// Test-build transport only. The real pi session still executes its normal
// tools, steering, persistence and cancellation lifecycle.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import { zeroUsage } from '../assistant/session.ts';

type Step = { reply?: string; delayMs?: number; actions?: Array<{ name: string; argsJson: string }> };
type Fixture = { when: string; result?: Step; steps?: Step[]; error?: string };
export const simulatedStream: StreamFn = (model, context, options) => {
  const stream = new AssistantMessageEventStream();
  const answer: AssistantMessage = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [], usage: structuredClone(zeroUsage), stopReason: 'stop', timestamp: Date.now() };
  void (async () => {
    try {
      const fixtures = JSON.parse(await readFile(process.env.WERK_AI_FIXTURES!, 'utf8')) as Fixture[];
      const index = context.messages.findLastIndex(m => m.role === 'user'), user = context.messages[index];
      const text = typeof user.content === 'string' ? user.content : user.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      const fixture = fixtures.find(f => text.includes(f.when)); if (!fixture) throw new Error('No simulated session fixture matches.');
      if (fixture.error) throw new Error(fixture.error);
      const round = context.messages.slice(index + 1).filter(m => m.role === 'assistant' && m.stopReason !== 'aborted' && m.stopReason !== 'error').length;
      const step = fixture.steps?.[round] || (round === 0 ? fixture.result : { reply: fixture.result?.reply }) || { reply: 'Done.' };
      stream.push({ type: 'start', partial: answer });
      if (step.delayMs) await delay(step.delayMs, undefined, { signal: options?.signal });
      options?.signal?.throwIfAborted();
      if (step.actions?.length) {
        answer.content = step.actions.map(action => ({ type: 'toolCall' as const, id: randomUUID(), name: action.name, arguments: JSON.parse(action.argsJson) }));
        answer.stopReason = 'toolUse';
      } else {
        answer.content = [{ type: 'text', text: '' }];
        stream.push({ type: 'text_start', contentIndex: 0, partial: answer });
        for (const chunk of (step.reply || 'Done.').match(/.{1,12}/gs) || []) {
          options?.signal?.throwIfAborted(); (answer.content[0] as { text: string }).text += chunk;
          stream.push({ type: 'text_delta', contentIndex: 0, delta: chunk, partial: structuredClone(answer) });
          await delay(15, undefined, { signal: options?.signal });
        }
        stream.push({ type: 'text_end', contentIndex: 0, content: step.reply || 'Done.', partial: answer });
      }
      stream.push({ type: 'done', reason: answer.stopReason as 'stop'|'toolUse', message: answer });
    } catch (error) {
      answer.stopReason = options?.signal?.aborted ? 'aborted' : 'error'; answer.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: 'error', reason: answer.stopReason, error: answer });
    }
  })();
  return stream;
};
