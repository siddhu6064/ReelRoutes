import React, { useReducer, useRef, useState } from 'react';
import { Modal, Button, Spinner } from './ui';
import { MessageCircle, Sparkles } from 'lucide-react';
import { aiAPI } from '../services/api';
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
} from '../lib/aiInsightsChatState';

const DEFAULT_QUESTION = 'How can I save more this month?';

export default function AIInsightsChat({ isOpen, onClose, profileId }) {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [state, dispatch] = useReducer(aiInsightsChatReducer, initialAIChatState);
  const questionInputRef = useRef(null);

  const recommendation = state.recommendation;

  const askQuestion = async (questionText) => {
    if (!profileId || state.isLoading) return;

    const payload = buildChatInsightsPayload({ profileId, question: questionText });
    if (!payload.question) {
      dispatch({ type: 'SUBMIT_ERROR', error: 'Please enter a question to continue.' });
      return;
    }

    dispatch({ type: 'SUBMIT_START', question: payload.question });
    try {
      const response = await aiAPI.chatInsights(payload);
      dispatch({
        type: 'SUBMIT_SUCCESS',
        recommendation: normalizeRecommendationResponse(response.data),
      });
    } catch (error) {
      dispatch({ type: 'SUBMIT_ERROR', error: 'We couldn’t generate insights right now. Please try again.' });
    }
  };

  const submitQuestion = async (event) => {
    event.preventDefault();
    await askQuestion(question);
  };

  const handleSuggestionClick = async (suggestion) => {
    setQuestion(suggestion);
    dispatch({ type: 'SET_QUESTION', question: suggestion });
    await askQuestion(suggestion);
  };

  const handleRetry = async () => {
    if (!state.lastQuestion) return;
    await askQuestion(state.lastQuestion);
  };

  const handleClose = () => {
    dispatch({ type: 'CLOSE' });
    onClose();
  };

  React.useEffect(() => {
    if (isOpen) {
      dispatch({ type: 'OPEN' });
      setTimeout(() => questionInputRef.current?.focus(), 0);
    } else {
      dispatch({ type: 'CLOSE' });
      setQuestion(DEFAULT_QUESTION);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const hydrated = hydrateChatSession(window.sessionStorage.getItem(AI_CHAT_SESSION_KEY));
    if (hydrated) {
      dispatch({ type: 'HYDRATE_SESSION', payload: hydrated });
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      AI_CHAT_SESSION_KEY,
      JSON.stringify(buildPersistableChatState(state))
    );
  }, [state.messages, state.recommendation, state.lastQuestion]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="AI Insights" size="lg">
      <div className="space-y-4" data-testid="ai-insights-chat">
        <div className="p-3 rounded-xl bg-brand-primary/10 text-sm text-text-secondary flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-brand-primary mt-0.5" />
          <p>Ask a focused money question. SAVIQ responds using your recent spend, trends, budgets, and forecast data.</p>
        </div>

        <form onSubmit={submitQuestion} className="space-y-3">
          <label htmlFor="ai-chat-question-input" className="block text-sm font-medium text-text-primary">Question</label>
          <textarea
            id="ai-chat-question-input"
            ref={questionInputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(event) => {
              if (!shouldSubmitOnKeyDown(event)) return;
              event.preventDefault();
              submitQuestion(event);
            }}
            className="w-full min-h-[90px] px-4 py-3 bg-white border border-border-color rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            placeholder="Why did I spend more this month?"
            data-testid="ai-chat-question-input"
          />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button type="button" variant="secondary" onClick={handleClose} data-testid="ai-chat-close">
              Close
            </Button>
            <Button
              type="submit"
              disabled={isAIChatSubmitDisabled({ question, isLoading: state.isLoading, profileId })}
              aria-busy={state.isLoading}
              data-testid="ai-chat-submit"
            >
              {state.isLoading ? (
                <>
                  <Spinner size="sm" className="mr-2 text-white" />
                  Analyzing...
                </>
              ) : (
                <>
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Ask AI
                </>
              )}
            </Button>
          </div>
        </form>

        <div className="flex flex-wrap gap-2">
          {AI_CHAT_PROMPT_SUGGESTIONS.map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              className="px-3 py-1.5 rounded-full text-xs bg-surface-hover text-text-secondary hover:text-text-primary"
              data-testid={`ai-chat-suggestion-${suggestion.slice(0, 12)}`}
            >
              {suggestion}
            </button>
          ))}
        </div>

        {state.error && (
          <div className="text-sm text-expense space-y-2" data-testid="ai-chat-error" role="alert">
            <p>{state.error}</p>
            <Button type="button" variant="secondary" size="sm" onClick={handleRetry} data-testid="ai-chat-retry">
              Try again
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between -mt-1">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Conversation</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'CLEAR_CONVERSATION' })}
            data-testid="ai-chat-clear"
          >
            Clear
          </Button>
        </div>

        <div className={getChatHistoryContainerClass()} data-testid="ai-chat-history">
          {state.messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user'
                ? 'ml-8 bg-brand-primary text-white rounded-xl p-3 text-sm'
                : 'mr-8 border border-border-color rounded-xl p-3 text-sm'}
            >
              {message.role === 'user' ? (
                <p>{message.text}</p>
              ) : (
                <>
                  <h3 className="font-semibold text-text-primary">{message.recommendation?.title}</h3>
                  <p className="text-sm text-text-secondary mt-1">{message.recommendation?.summary}</p>
                  {(message.recommendation?.actions || []).length > 0 && (
                    <ul className="list-disc ml-5 space-y-1 text-sm text-text-primary mt-2">
                      {(message.recommendation?.actions || []).map((item, idx) => (
                        <li key={`${idx}-${item.slice(0, 16)}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          ))}

          {state.isLoading && (
            <div className="mr-8 border border-border-color rounded-xl p-3 space-y-2" data-testid="ai-chat-loading-skeleton">
              <div className="h-3 bg-surface-hover rounded w-2/3 animate-pulse" />
              <div className="h-3 bg-surface-hover rounded w-full animate-pulse" />
              <div className="h-3 bg-surface-hover rounded w-5/6 animate-pulse" />
              <p className="text-xs text-text-secondary flex items-center gap-1 mt-2" data-testid="ai-chat-typing">
                <Spinner size="sm" /> SAVIQ is preparing your guidance...
              </p>
            </div>
          )}
        </div>

        {recommendation && (
          <div className="border border-border-color rounded-xl p-4 space-y-2" data-testid="ai-chat-latest-response" aria-live="polite">
            <h4 className="text-xs uppercase tracking-wide text-text-secondary">Latest response</h4>
            <p className="text-sm font-semibold text-text-primary">{recommendation.title}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
