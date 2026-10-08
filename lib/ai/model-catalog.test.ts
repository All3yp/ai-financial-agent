import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterChatModels,
  getChatModels,
  type Model,
} from './model-catalog';
import { findChatModel } from './models';

test('shared chat filter excludes decision, embedding, and audio endpoints', () => {
  const models: Model[] = [
    {
      id: 'chat-model',
      label: 'Chat',
      apiIdentifier: 'chat-model',
      description: 'Chat endpoint',
    },
    {
      id: 'decision-model',
      label: 'Decision',
      apiIdentifier: 'decision-model',
      description: 'Decision endpoint',
      endpointType: 'decision',
    },
    {
      id: 'embedding-model',
      label: 'Embedding',
      apiIdentifier: 'embedding-model',
      description: 'Embedding endpoint',
      category: 'embedding',
    },
    {
      id: 'audio-model',
      label: 'Audio',
      apiIdentifier: 'audio-model',
      description: 'Audio endpoint',
      category: 'audio',
    },
  ];

  assert.deepEqual(filterChatModels(models).map((model) => model.id), ['chat-model']);
});

test('existing Mercury catalog entry remains on its pre-existing chat path', () => {
  assert.ok(
    getChatModels().some((model) => model.id === 'inception/mercury-decide:free'),
  );
});

test('primary and fallback resolution reject decision-only endpoint entries', () => {
  const models: Model[] = [
    {
      id: 'chat-model',
      label: 'Chat',
      apiIdentifier: 'chat-model',
      description: 'Chat endpoint',
    },
    {
      id: 'decision-model',
      label: 'Decision',
      apiIdentifier: 'decision-model',
      description: 'Decision endpoint',
      endpointType: 'decision',
    },
  ];
  assert.equal(findChatModel('chat-model', models)?.id, 'chat-model');
  assert.equal(findChatModel('decision-model', models), undefined);
});