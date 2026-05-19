import { getSafeChatSession, markPendingAsInterrupted } from './aiChatSessionState.js';

export function deriveIsChatSubmitDisabled({ profileId, isLoading, prompt }) {
  const safeProfileId = String(profileId || '').trim();
  const safePrompt = String(prompt || '').trim();
  return safeProfileId.length === 0 || isLoading || safePrompt.length < 3 || safePrompt.length > 300;
}


export function deriveCanApplyChatSuggestion({ isLoading, suggestion }) {
  if (isLoading) return false;
  const safeSuggestion = String(suggestion || '').trim();
  return safeSuggestion.length >= 3 && safeSuggestion.length <= 300;
}

export function applyChatSuggestion(session, suggestion) {
  const safe = getSafeChatSession(session);
  return {
    ...safe,
    prompt: String(suggestion || '').trim(),
  };
}

export function buildChatSendQuestionParams({
  profileId,
  isLoading,
  prompt,
  pendingMessageId,
  appendUserMessage = true,
}) {
  const safeProfileId = String(profileId || '').trim();
  const question = String(prompt || '').trim();
  const safePendingMessageId = String(pendingMessageId || '').trim();
  if (safeProfileId.length === 0 || isLoading || question.length < 3 || question.length > 300) return null;
  if (!appendUserMessage && safePendingMessageId.length === 0) return null;

  return {
    question,
    pendingMessageId: appendUserMessage ? pendingMessageId : safePendingMessageId,
    appendUserMessage,
  };
}


export function deriveCanRetryFailedMessage({ message, isLoading }) {
  if (isLoading) return false;
  if (message?.status !== 'failed') return false;
  return String(message?.retryQuestion || '').trim().length >= 3;
}

export function deriveChatSessionOnModalClose({ isLoading, session, lastSubmittedQuestion }) {
  const safeSession = getSafeChatSession(session);
  const hasPendingMessage = safeSession.messages.some((message) => message?.status === 'pending');
  if (!isLoading && !hasPendingMessage) return safeSession;
  return markPendingAsInterrupted(safeSession, String(lastSubmittedQuestion || ''));
}
