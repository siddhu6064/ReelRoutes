import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AI_CHAT_SESSION_KEY,
  AI_CHAT_PROMPT_SUGGESTIONS,
  aiInsightsChatReducer,
  buildPersistableChatState,
  buildChatInsightsPayload,
  getChatHistoryContainerClass,
  hydrateChatSession,
  isAIChatSubmitDisabled,
  initialAIChatState,
  normalizeRecommendationResponse,
  shouldSubmitOnKeyDown,
} from './aiInsightsChatState.js';

test('chat entry point state opens chat UI', () => {
  const state = aiInsightsChatReducer(initialAIChatState, { type: 'OPEN' });
  assert.equal(state.isOpen, true);
});

test('chat UI closes correctly', () => {
  const opened = aiInsightsChatReducer(
    {
      ...initialAIChatState,
      messages: [{ id: 'u1', role: 'user', text: 'Hello' }],
      recommendation: { title: 'Prior response', summary: 'Summary', actions: [] },
    },
    { type: 'OPEN' }
  );
  const closed = aiInsightsChatReducer(opened, { type: 'CLOSE' });
  assert.equal(closed.isOpen, false);
  assert.equal(closed.messages.length, 1);
  assert.equal(closed.recommendation, null);
});

test('chat reopen remains clean after close reset', () => {
  const closed = aiInsightsChatReducer(
    {
      ...initialAIChatState,
      recommendation: { title: 'Prior response', summary: 'Summary', actions: [] },
      error: 'Previous error',
    },
    { type: 'CLOSE' }
  );

  const reopened = aiInsightsChatReducer(closed, { type: 'OPEN' });
  assert.equal(reopened.isOpen, true);
  assert.equal(reopened.recommendation, null);
  assert.equal(reopened.error, '');
});

test('question submission triggers expected API contract shape', () => {
  const payload = buildChatInsightsPayload({
    profileId: 'profile_1',
    question: '  How can I save more? ',
    recentDays: 30,
  });

  assert.deepEqual(payload, {
    profile_id: 'profile_1',
    question: 'How can I save more?',
    recent_days: 30,
  });
});

test('structured response renders expected recommendation fields', () => {
  const parsed = normalizeRecommendationResponse({
    recommendation: {
      title: 'Here is your plan',
      summary: 'Spending rose in Food this month.',
      actions: ['Cut one restaurant visit this week.'],
    },
  });

  assert.equal(parsed.title, 'Here is your plan');
  assert.equal(parsed.summary, 'Spending rose in Food this month.');
  assert.deepEqual(parsed.actions, ['Cut one restaurant visit this week.']);
});

test('loading and error states behave safely in reducer', () => {
  const loading = aiInsightsChatReducer(initialAIChatState, {
    type: 'SUBMIT_START',
    question: 'How can I save more?',
  });
  assert.equal(loading.isLoading, true);
  assert.equal(loading.messages.at(-1).role, 'user');

  const errored = aiInsightsChatReducer(loading, { type: 'SUBMIT_ERROR', error: 'Temporary failure' });
  assert.equal(errored.isLoading, false);
  assert.equal(errored.error, 'Temporary failure');
});

test('message history appends user and assistant entries correctly', () => {
  const afterUser = aiInsightsChatReducer(initialAIChatState, {
    type: 'SUBMIT_START',
    question: 'Why did I spend more this month?',
  });
  const afterAssistant = aiInsightsChatReducer(afterUser, {
    type: 'SUBMIT_SUCCESS',
    recommendation: {
      title: 'Spending increased',
      summary: 'Month-over-month spend went up.',
      actions: ['Review top category.'],
    },
  });

  assert.equal(afterAssistant.messages.length, 2);
  assert.equal(afterAssistant.messages[0].role, 'user');
  assert.equal(afterAssistant.messages[1].role, 'assistant');
});

test('retry state preserves last question for resend behavior', () => {
  const loading = aiInsightsChatReducer(initialAIChatState, {
    type: 'SUBMIT_START',
    question: 'How can I reduce dining spend?',
  });
  const errored = aiInsightsChatReducer(loading, {
    type: 'SUBMIT_ERROR',
    error: 'Could not load insights. Please try again.',
  });

  assert.equal(errored.lastQuestion, 'How can I reduce dining spend?');
});

test('prompt suggestions render as expected static options', () => {
  assert.equal(AI_CHAT_PROMPT_SUGGESTIONS.length >= 2, true);
  assert.equal(
    AI_CHAT_PROMPT_SUGGESTIONS.includes('Why did I spend more this month?'),
    true
  );
  assert.equal(
    AI_CHAT_PROMPT_SUGGESTIONS.includes('How can I reduce dining spend?'),
    true
  );
});

test('existing response normalization remains intact', () => {
  const parsed = normalizeRecommendationResponse(null);
  assert.equal(parsed.title, 'SAVIQ Insight');
  assert.equal(parsed.summary, 'Add a bit more activity to unlock tailored insight.');
  assert.deepEqual(parsed.actions, []);
});

test('clear/reset conversation behavior is safe and intentional', () => {
  const populated = {
    ...initialAIChatState,
    messages: [{ id: 'u1', role: 'user', text: 'How can I save more?' }],
    lastQuestion: 'How can I save more?',
    recommendation: { title: 'Tip', summary: 'Cut spend.', actions: ['Do X'] },
  };
  const cleared = aiInsightsChatReducer(populated, { type: 'CLEAR_CONVERSATION' });

  assert.deepEqual(cleared.messages, []);
  assert.equal(cleared.lastQuestion, '');
  assert.equal(cleared.recommendation, null);
});

test('keyboard submit behavior triggers only on Enter without Shift', () => {
  assert.equal(shouldSubmitOnKeyDown({ key: 'Enter', shiftKey: false }), true);
  assert.equal(shouldSubmitOnKeyDown({ key: 'Enter', shiftKey: true }), false);
  assert.equal(shouldSubmitOnKeyDown({ key: 'a', shiftKey: false }), false);
});

test('submit disabled contract enforces whitespace-invalid and valid input states', () => {
  assert.equal(
    isAIChatSubmitDisabled({ question: '   ', isLoading: false, profileId: 'profile_1' }),
    true
  );
  assert.equal(
    isAIChatSubmitDisabled({ question: 'How can I save this week?', isLoading: false, profileId: 'profile_1' }),
    false
  );
});

test('mobile-safe layout class includes constrained scroll behavior', () => {
  const className = getChatHistoryContainerClass();
  assert.equal(className.includes('max-h-[45vh]'), true);
  assert.equal(className.includes('overflow-y-auto'), true);
});

test('session persistence helpers serialize and hydrate safely', () => {
  const persistable = buildPersistableChatState({
    messages: [{ id: 'u1', role: 'user', text: 'Question' }],
    lastQuestion: 'Question',
    recommendation: { title: 'Title', summary: 'Summary', actions: ['A'] },
  });
  const hydrated = hydrateChatSession(JSON.stringify(persistable));

  assert.equal(AI_CHAT_SESSION_KEY, 'saviq_ai_chat_session_v1');
  assert.deepEqual(hydrated, persistable);
  assert.equal(hydrateChatSession('{bad json'), null);
});
