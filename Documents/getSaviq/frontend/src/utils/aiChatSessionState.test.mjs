import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AI_CHAT_PROMPT,
  getSafeChatSession,
  markPendingAsInterrupted,
  resolveAssistantFailure,
  resolveAssistantSuccess,
  sanitizePersistedChatSessions,
  upsertPendingAssistant,
} from './aiChatSessionState.js';

test('chat session helpers keep safe defaults for empty/invalid session payloads', () => {
  const safe = getSafeChatSession({ messages: null, prompt: undefined });
  assert.deepEqual(safe.messages, []);
  assert.equal(safe.prompt, DEFAULT_AI_CHAT_PROMPT);
});

test('upsertPendingAssistant appends user + pending message and can update same pending message on retry', () => {
  const first = upsertPendingAssistant({
    session: { messages: [], prompt: 'Q' },
    question: 'How can I cut spend?',
    pendingId: 'pending-1',
    appendUserMessage: true,
    userMessageId: 'user-1',
  });

  assert.equal(first.messages.length, 2);
  assert.equal(first.messages[0].role, 'user');
  assert.equal(first.messages[1].status, 'pending');

  const retry = upsertPendingAssistant({
    session: first,
    question: 'How can I cut spend?',
    pendingId: 'pending-1',
    appendUserMessage: false,
  });

  assert.equal(retry.messages.length, 2);
  assert.equal(retry.messages[1].id, 'pending-1');
  assert.equal(retry.messages[1].status, 'pending');
});

test('assistant success/failure transitions resolve pending state deterministically', () => {
  const pending = {
    messages: [
      { id: 'user-1', role: 'user', text: 'question', status: 'sent' },
      { id: 'pending-1', role: 'assistant', text: 'typing', status: 'pending', retryQuestion: 'question' },
    ],
    prompt: 'question',
  };

  const success = resolveAssistantSuccess({
    session: pending,
    pendingId: 'pending-1',
    assistantText: 'Actionable answer',
    generatedAt: '2026-01-01T00:00:00Z',
  });
  assert.equal(success.prompt, '');
  assert.equal(success.messages[1].status, 'sent');
  assert.equal(success.messages[1].text, 'Actionable answer');

  const failed = resolveAssistantFailure({
    session: pending,
    pendingId: 'pending-1',
    question: 'question',
  });
  assert.equal(failed.messages[1].status, 'failed');
  assert.equal(failed.messages[1].retryQuestion, 'question');

  const failedWithoutQuestion = resolveAssistantFailure({
    session: pending,
    pendingId: 'pending-1',
    question: '',
  });
  assert.equal(failedWithoutQuestion.messages[1].retryQuestion, 'question');

});

test('markPendingAsInterrupted preserves retry context and avoids broken pending states after reopen', () => {
  const interrupted = markPendingAsInterrupted(
    {
      messages: [{ id: 'pending-1', role: 'assistant', status: 'pending', text: 'typing' }],
      prompt: '',
    },
    'saved-question'
  );

  assert.equal(interrupted.messages[0].status, 'failed');
  assert.match(interrupted.messages[0].text, /interrupted/i);
  assert.equal(interrupted.messages[0].retryQuestion, 'saved-question');
});

test('sanitizePersistedChatSessions preserves profile isolation and degrades pending states on restart restore', () => {
  const sanitized = sanitizePersistedChatSessions({
    profileA: {
      prompt: 'draft A',
      messages: [{ id: 'm1', role: 'assistant', status: 'pending', text: 'typing', retryQuestion: 'Q1' }],
    },
    profileB: {
      prompt: 'draft B',
      messages: [{ id: 'm2', role: 'assistant', status: 'sent', text: 'done' }],
    },
  });

  assert.equal(Object.keys(sanitized).length, 2);
  assert.equal(sanitized.profileA.messages[0].status, 'failed');
  assert.equal(sanitized.profileA.messages[0].retryQuestion, 'Q1');
  assert.equal(sanitized.profileB.messages[0].status, 'sent');
  assert.equal(sanitized.profileB.prompt, 'draft B');

  const trimmed = sanitizePersistedChatSessions({
    ' profileC ': {
      prompt: 'draft C',
      messages: [{ id: 'm3', role: 'assistant', status: 'sent', text: 'ok' }],
    },
    '   ': {
      prompt: 'should drop',
      messages: [],
    },
  });
  assert.equal(trimmed.profileC.prompt, 'draft C');
  assert.equal(Object.keys(trimmed).includes(''), false);

});

test('sanitizePersistedChatSessions avoids normalized profile-id collision overwrites', () => {
  const sanitized = sanitizePersistedChatSessions({
    profileA: { prompt: 'first', messages: [{ id: 'm1', role: 'assistant', status: 'sent', text: 'one' }] },
    ' profileA ': { prompt: 'second', messages: [{ id: 'm2', role: 'assistant', status: 'sent', text: 'two' }] },
  });

  assert.equal(Object.keys(sanitized).length, 1);
  assert.equal(sanitized.profileA.prompt, 'first');
  assert.equal(sanitized.profileA.messages[0].text, 'one');
});
