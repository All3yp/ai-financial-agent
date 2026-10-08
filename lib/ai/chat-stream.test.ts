import assert from 'node:assert/strict';
import test from 'node:test';
import { createDataStreamResponse, streamText, type CoreMessage } from 'ai';
import { MockLanguageModelV1, simulateReadableStream } from 'ai/test';
import { appendChatTasks, streamChatResult } from './chat-stream';

test('original question and image content are preserved with research tasks', () => {
  const messages: CoreMessage[] = [{ role: 'user', content: 'Compare AAPL with MSFT over five years' }];
  const original = structuredClone(messages);
  const result = appendChatTasks(messages, ['Retrieving financials']);
  assert.match(String(result[0].content), /Compare AAPL with MSFT over five years/);
  assert.match(String(result[0].content), /Retrieving financials/);
  assert.deepEqual(messages, original);
  const image: CoreMessage[] = [{ role: 'user', content: [{ type: 'image', image: new URL('https://example.org/image.png') }, { type: 'text', text: 'What changed?' }] }];
  const augmented = appendChatTasks(image, ['Reviewing image']);
  assert.equal((augmented[0].content as Array<unknown>).length, 3);
  assert.deepEqual(appendChatTasks(messages, []), messages);
});

test('SDK text and custom events reach the response data stream', async () => {
  const model = new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: [
        { type: 'text-delta' as const, textDelta: 'Verified financial response' },
        { type: 'finish' as const, finishReason: 'stop' as const, usage: { promptTokens: 1, completionTokens: 3 } },
      ] }),
      rawCall: { rawPrompt: null, rawSettings: {} },
    }),
  });
  const response = createDataStreamResponse({ execute: async (writer) => {
    writer.writeData({ type: 'model-attempt', content: { modelId: 'mock' } });
    const result = streamText({ model, messages: [{ role: 'user', content: 'Research' }] });
    assert.equal(await streamChatResult(result, writer), 'Verified financial response');
  } });
  const protocol = await response.text();
  assert.match(protocol, /0:"Verified financial response"/);
  assert.match(protocol, /model-attempt/);
});