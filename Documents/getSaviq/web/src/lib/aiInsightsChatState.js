export const initialAIChatState = {
  isOpen: false,
  isLoading: false,
  error: '',
  recommendation: null,
  messages: [],
  lastQuestion: '',
};

export const AI_CHAT_SESSION_KEY = 'saviq_ai_chat_session_v1';

export function aiInsightsChatReducer(state, action) {
  switch (action.type) {
    case 'OPEN':
      return { ...state, isOpen: true, error: '' };
    case 'CLOSE':
      return { ...state, isOpen: false, isLoading: false, error: '', recommendation: null };
    case 'HYDRATE_SESSION':
      return {
        ...state,
        recommendation: action.payload?.recommendation || null,
        messages: Array.isArray(action.payload?.messages) ? action.payload.messages : state.messages,
        lastQuestion: action.payload?.lastQuestion || state.lastQuestion,
      };
    case 'SUBMIT_START':
      return {
        ...state,
        isLoading: true,
        error: '',
        recommendation: null,
        lastQuestion: action.question || state.lastQuestion,
        messages: [
          ...state.messages,
          {
            id: action.messageId || `user-${Date.now()}`,
            role: 'user',
            text: action.question || '',
          },
        ],
      };
    case 'SUBMIT_SUCCESS':
      return {
        ...state,
        isLoading: false,
        recommendation: action.recommendation || null,
        messages: [
          ...state.messages,
          {
            id: action.messageId || `assistant-${Date.now()}`,
            role: 'assistant',
            recommendation: action.recommendation || null,
          },
        ],
      };
    case 'SUBMIT_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.error || 'SAVIQ could not generate insights right now.',
      };
    case 'SET_QUESTION':
      return {
        ...state,
        lastQuestion: action.question || state.lastQuestion,
      };
    case 'CLEAR_CONVERSATION':
      return {
        ...state,
        recommendation: null,
        messages: [],
        error: '',
        lastQuestion: '',
      };
    default:
      return state;
  }
}

export function buildChatInsightsPayload({ profileId, question, recentDays = 30 }) {
  return {
    profile_id: profileId,
    question: String(question || '').trim(),
    recent_days: recentDays,
  };
}

export function normalizeRecommendationResponse(responseData) {
  const recommendation = responseData?.recommendation || {};
  return {
    title: recommendation.title || 'SAVIQ Insight',
    summary: recommendation.summary || 'Add a bit more activity to unlock tailored insight.',
    actions: Array.isArray(recommendation.actions) ? recommendation.actions : [],
  };
}

export const AI_CHAT_PROMPT_SUGGESTIONS = [
  'Why did I spend more this month?',
  'How can I reduce dining spend?',
  'What should I focus on this week to save more?',
];

export function shouldSubmitOnKeyDown(event) {
  return Boolean(event?.key === 'Enter' && !event?.shiftKey);
}

export function isAIChatSubmitDisabled({ question, isLoading, profileId }) {
  if (isLoading || !profileId) return true;
  return String(question || '').trim().length === 0;
}

export function getChatHistoryContainerClass() {
  return 'space-y-3 max-h-[45vh] sm:max-h-72 overflow-y-auto pr-1';
}

export function buildPersistableChatState(state) {
  return {
    recommendation: state?.recommendation || null,
    messages: Array.isArray(state?.messages) ? state.messages : [],
    lastQuestion: state?.lastQuestion || '',
  };
}

export function hydrateChatSession(serialized) {
  if (!serialized || typeof serialized !== 'string') return null;
  try {
    const parsed = JSON.parse(serialized);
    return buildPersistableChatState(parsed);
  } catch (_error) {
    return null;
  }
}
