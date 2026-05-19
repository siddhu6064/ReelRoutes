export const DEFAULT_AI_CHAT_PROMPT = 'How can I save more this month?';

export const AI_CHAT_PROMPT_SUGGESTIONS = [
  'Where did I overspend vs last month?',
  'What is my biggest spend category?',
  'Give me two quick ways to save this week.',
  'Am I likely to go over budget this month?',
  'Which subscriptions should I review first?',
];

export function getSafeChatSession(session) {
  return {
    messages: Array.isArray(session?.messages) ? session.messages : [],
    prompt: String(session?.prompt || DEFAULT_AI_CHAT_PROMPT),
  };
}

export function upsertPendingAssistant({
  session,
  question,
  pendingId,
  appendUserMessage = true,
  userMessageId = `user-${Date.now()}`,
}) {
  const current = getSafeChatSession(session);
  const next = [...current.messages];

  if (appendUserMessage) {
    next.push({
      id: userMessageId,
      role: 'user',
      text: question,
      status: 'sent',
    });
  }

  const pendingMessage = {
    id: pendingId,
    role: 'assistant',
    text: 'SAVIQ is typing...',
    status: 'pending',
    retryQuestion: question,
  };
  const pendingIndex = next.findIndex((message) => message.id === pendingId);
  if (pendingIndex >= 0) next[pendingIndex] = pendingMessage;
  else next.push(pendingMessage);

  return { ...current, messages: next };
}

export function resolveAssistantSuccess({ session, pendingId, assistantText, generatedAt }) {
  const current = getSafeChatSession(session);
  return {
    ...current,
    prompt: '',
    messages: current.messages.map((message) =>
      message.id === pendingId
        ? {
            ...message,
            text: assistantText,
            generatedAt,
            status: 'sent',
            retryQuestion: undefined,
          }
        : message
    ),
  };
}

export function resolveAssistantFailure({ session, pendingId, question }) {
  const current = getSafeChatSession(session);
  return {
    ...current,
    messages: current.messages.map((message) =>
      message.id === pendingId
        ? {
            ...message,
            text: 'Could not generate insights right now.',
            status: 'failed',
            retryQuestion: question || message.retryQuestion || '',
          }
        : message
    ),
  };
}

export function markPendingAsInterrupted(session, fallbackQuestion = '') {
  const current = getSafeChatSession(session);
  return {
    ...current,
    messages: current.messages.map((message) =>
      message.status === 'pending'
        ? {
            ...message,
            text: 'Request interrupted. Tap retry.',
            status: 'failed',
            retryQuestion: message.retryQuestion || fallbackQuestion,
          }
        : message
    ),
  };
}

export function sanitizePersistedChatSessions(rawSessions) {
  if (!rawSessions || typeof rawSessions !== 'object' || Array.isArray(rawSessions)) {
    return {};
  }

  return Object.entries(rawSessions).reduce((acc, [profileId, session]) => {
    const safeProfileId = String(profileId || '').trim();
    if (safeProfileId.length === 0 || acc[safeProfileId]) return acc;
    acc[safeProfileId] = markPendingAsInterrupted(getSafeChatSession(session));
    return acc;
  }, {});
}
