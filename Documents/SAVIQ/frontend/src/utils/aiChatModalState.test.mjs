import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyChatSuggestion,
  buildChatSendQuestionParams,
  deriveCanApplyChatSuggestion,
  deriveCanRetryFailedMessage,
  deriveChatSessionOnModalClose,
  deriveIsChatSubmitDisabled,
} from './aiChatModalState.js';

test('chat modal open state supports empty state and suggestion tap fills composer', () => {
  const nextSession = applyChatSuggestion({ messages: [], prompt: '' }, 'What changed this month?');
  assert.equal(nextSession.prompt, 'What changed this month?');
  assert.deepEqual(nextSession.messages, []);
});

test('chat modal send/disable guard supports pending->success/failure orchestration preconditions', () => {
  assert.equal(deriveIsChatSubmitDisabled({ profileId: '', isLoading: false, prompt: 'hello world' }), true);
  assert.equal(deriveIsChatSubmitDisabled({ profileId: '   ', isLoading: false, prompt: 'hello world' }), true);
  assert.equal(deriveIsChatSubmitDisabled({ profileId: 'p1', isLoading: true, prompt: 'hello world' }), true);
  assert.equal(deriveIsChatSubmitDisabled({ profileId: 'p1', isLoading: false, prompt: 'ok' }), true);
  assert.equal(deriveIsChatSubmitDisabled({ profileId: 'p1', isLoading: false, prompt: 'How to save more?' }), false);
  assert.equal(deriveIsChatSubmitDisabled({ profileId: 'p1', isLoading: false, prompt: 'x'.repeat(301) }), true);

  const sendParams = buildChatSendQuestionParams({
    profileId: 'p1',
    isLoading: false,
    prompt: '  How do I reduce dining spend? ',
    appendUserMessage: true,
  });
  assert.equal(sendParams.question, 'How do I reduce dining spend?');
  assert.equal(sendParams.appendUserMessage, true);

  const blocked = buildChatSendQuestionParams({ profileId: 'p1', isLoading: true, prompt: 'valid question' });
  assert.equal(blocked, null);

  const tooLongBlocked = buildChatSendQuestionParams({ profileId: 'p1', isLoading: false, prompt: 'x'.repeat(301) });
  assert.equal(tooLongBlocked, null);

  const blankProfileBlocked = buildChatSendQuestionParams({ profileId: '   ', isLoading: false, prompt: 'valid question' });
  assert.equal(blankProfileBlocked, null);

  const retryWithoutPendingId = buildChatSendQuestionParams({
    profileId: 'p1',
    isLoading: false,
    prompt: 'Retry this',
    appendUserMessage: false,
    pendingMessageId: '   ',
  });
  assert.equal(retryWithoutPendingId, null);

  const retryWithTrimmedPendingId = buildChatSendQuestionParams({
    profileId: 'p1',
    isLoading: false,
    prompt: 'Retry this',
    appendUserMessage: false,
    pendingMessageId: ' pending-1 ',
  });
  assert.equal(retryWithTrimmedPendingId.pendingMessageId, 'pending-1');


});

test('chat modal close/reopen handling keeps retry-capable state and profile isolation safety', () => {
  const interrupted = deriveChatSessionOnModalClose({
    isLoading: true,
    session: {
      prompt: 'draft',
      messages: [{ id: 'a1', role: 'assistant', status: 'pending', text: 'typing...', retryQuestion: 'Q1' }],
    },
    lastSubmittedQuestion: 'Q1',
  });

  assert.equal(interrupted.messages[0].status, 'failed');
  assert.match(interrupted.messages[0].text, /interrupted/i);
  assert.equal(interrupted.messages[0].retryQuestion, 'Q1');


  const pendingEvenWhenNotLoading = deriveChatSessionOnModalClose({
    isLoading: false,
    session: {
      prompt: 'draft',
      messages: [{ id: 'a2', role: 'assistant', status: 'pending', text: 'typing...', retryQuestion: 'Q2' }],
    },
    lastSubmittedQuestion: 'Q2',
  });
  assert.equal(pendingEvenWhenNotLoading.messages[0].status, 'failed');
  assert.equal(pendingEvenWhenNotLoading.messages[0].retryQuestion, 'Q2');

  const untouched = deriveChatSessionOnModalClose({
    isLoading: false,
    session: {
      prompt: 'profile-B-draft',
      messages: [{ id: 'b1', role: 'assistant', status: 'sent', text: 'ready' }],
    },
    lastSubmittedQuestion: 'ignore',
  });
  assert.equal(untouched.prompt, 'profile-B-draft');
  assert.equal(untouched.messages[0].status, 'sent');
});


test('failed-message retry affordance is disabled deterministically when loading or retryQuestion is missing', () => {
  assert.equal(deriveCanRetryFailedMessage({ message: { status: 'failed', retryQuestion: 'How can I save?' }, isLoading: false }), true);
  assert.equal(deriveCanRetryFailedMessage({ message: { status: 'failed', retryQuestion: '  ' }, isLoading: false }), false);
  assert.equal(deriveCanRetryFailedMessage({ message: { status: 'sent', retryQuestion: 'How can I save?' }, isLoading: false }), false);
  assert.equal(deriveCanRetryFailedMessage({ message: { status: 'failed', retryQuestion: 'How can I save?' }, isLoading: true }), false);
});



test('chat suggestion affordance is disabled deterministically when loading or suggestion text is invalid', () => {
  assert.equal(deriveCanApplyChatSuggestion({ isLoading: false, suggestion: 'How can I save more?' }), true);
  assert.equal(deriveCanApplyChatSuggestion({ isLoading: true, suggestion: 'How can I save more?' }), false);
  assert.equal(deriveCanApplyChatSuggestion({ isLoading: false, suggestion: '  ' }), false);
  assert.equal(deriveCanApplyChatSuggestion({ isLoading: false, suggestion: 'x'.repeat(301) }), false);
});

