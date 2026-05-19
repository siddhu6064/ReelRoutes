import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightTheme } from '../NeumorphicUI';
import { aiAPI } from '../../services/api';
import { useAppStore } from '../../store/appStore';
import { useTheme } from '../../contexts/ThemeContext';
import {
  AI_CHAT_PROMPT_SUGGESTIONS,
  DEFAULT_AI_CHAT_PROMPT,
  getSafeChatSession,
  resolveAssistantFailure,
  resolveAssistantSuccess,
  upsertPendingAssistant,
} from '../../utils/aiChatSessionState';
import {
  applyChatSuggestion,
  buildChatSendQuestionParams,
  deriveCanApplyChatSuggestion,
  deriveCanRetryFailedMessage,
  deriveChatSessionOnModalClose,
  deriveIsChatSubmitDisabled,
} from '../../utils/aiChatModalState';

interface AIInsightsChatModalProps {
  visible: boolean;
  profileId?: string;
  profileName?: string;
  onClose: () => void;
}

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  generatedAt?: string;
  status?: 'pending' | 'failed' | 'sent';
  retryQuestion?: string;
};

function buildAssistantText(responseData: any) {
  const recommendation = responseData?.recommendation || {};
  const title = recommendation?.title ? String(recommendation.title) : 'SAVIQ Insight';
  const summary = recommendation?.summary ? String(recommendation.summary) : 'No summary available right now.';
  const actions = Array.isArray(recommendation?.actions) ? recommendation.actions.slice(0, 3) : [];
  const actionLines = actions.map((action: string) => `• ${action}`);
  return [title, summary, ...actionLines].join('\n');
}

export function AIInsightsChatModal({ visible, profileId, profileName, onClose }: AIInsightsChatModalProps) {
  const { colors, darkMode } = useTheme();
  const setAIChatSession = useAppStore((state) => state.setAIChatSession);
  const session = useAppStore((state) => (profileId ? state.aiChatSessions[profileId] : undefined));
  const messages = (session?.messages as ChatMessage[] | undefined) || [];
  const prompt = session?.prompt || DEFAULT_AI_CHAT_PROMPT;
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lastSubmittedQuestionRef = useRef('');

  const updateSession = (updater: (current: { messages: ChatMessage[]; prompt: string }) => { messages: ChatMessage[]; prompt: string }) => {
    if (!profileId) return;
    const liveSession = useAppStore.getState().aiChatSessions[profileId];
    const current = liveSession
      ? {
          messages: Array.isArray(liveSession.messages) ? (liveSession.messages as ChatMessage[]) : [],
          prompt: liveSession.prompt || DEFAULT_AI_CHAT_PROMPT,
        }
      : { messages: [], prompt: DEFAULT_AI_CHAT_PROMPT };
    setAIChatSession(profileId, updater(current));
  };

  useEffect(() => {
    if (!visible) {
      if (isLoading) {
        updateSession((current) => deriveChatSessionOnModalClose({
          isLoading,
          session: current,
          lastSubmittedQuestion: lastSubmittedQuestionRef.current,
        }));
      }
      setIsLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 40);
    return () => clearTimeout(timer);
  }, [messages, visible, isLoading]);

  const isSubmitDisabled = useMemo(
    () => deriveIsChatSubmitDisabled({ profileId, isLoading, prompt }),
    [profileId, isLoading, prompt]
  );

  const sendQuestion = async ({
    question,
    pendingMessageId,
    appendUserMessage = true,
  }: {
    question: string;
    pendingMessageId?: string;
    appendUserMessage?: boolean;
  }) => {
    const sendParams = buildChatSendQuestionParams({
      profileId,
      isLoading,
      prompt: question,
      pendingMessageId,
      appendUserMessage,
    });
    if (!sendParams) return;
    const pendingId = sendParams.pendingMessageId || `assistant-pending-${Date.now()}`;
    const userMessageId = `user-${Date.now()}`;
    lastSubmittedQuestionRef.current = question;
    setIsLoading(true);

    updateSession((current) =>
      upsertPendingAssistant({
        session: current,
        question,
        pendingId,
        appendUserMessage: sendParams.appendUserMessage,
        userMessageId,
      })
    );

    try {
      const response = await aiAPI.chatInsights({
        profile_id: profileId,
        question,
        recent_days: 30,
      });
      updateSession((current) =>
        resolveAssistantSuccess({
          session: getSafeChatSession(current),
          pendingId,
          assistantText: buildAssistantText(response?.data),
          generatedAt: response?.data?.generated_at,
        })
      );
    } catch {
      updateSession((current) =>
        resolveAssistantFailure({
          session: current,
          pendingId,
          question,
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    const question = String(prompt || '').trim();
    await sendQuestion({ question, appendUserMessage: true });
  };

  const handleRetry = async (question?: string, pendingMessageId?: string) => {
    const safeQuestion = String(question || '').trim();
    if (!safeQuestion) return;
    await sendQuestion({
      question: safeQuestion,
      pendingMessageId,
      appendUserMessage: false,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>AI Insights Chat</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {profileName ? `Profile: ${profileName}` : 'Ask about this profile'}
            </Text>
          </View>
          <TouchableOpacity style={[styles.closeButton, { backgroundColor: colors.surfaceHover }]} onPress={onClose} activeOpacity={0.8}>
            <Ionicons name="close-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.threadContent} keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <View style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Start a money conversation</Text>
              <Text style={styles.emptyBody}>
                Ask a focused question for a fast, profile-aware answer.
              </Text>
              <View style={styles.suggestionsWrap}>
                {AI_CHAT_PROMPT_SUGGESTIONS.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion}
                    onPress={() => {
                      if (!deriveCanApplyChatSuggestion({ isLoading, suggestion })) return;
                      updateSession((current) => applyChatSuggestion(current, suggestion));
                    }}
                    style={[
                      styles.suggestionChip,
                      {
                        borderColor: colors.border,
                        backgroundColor: darkMode ? colors.surfaceHover : '#F6F2FF',
                      },
                    ]}
                    disabled={!deriveCanApplyChatSuggestion({ isLoading, suggestion })}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.suggestionChipText, { color: darkMode ? colors.primary : lightTheme.colors.primaryDark }]}>
                      {suggestion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                  <Text
                    style={[
                      message.role === 'user' ? styles.userMessageText : styles.assistantMessageText,
                      message.role === 'assistant' ? { color: colors.textPrimary } : null,
                    ]}
                  >
                    {message.status === 'pending' ? 'SAVIQ is typing…' : message.text}
                  </Text>
                  {message.status === 'pending' ? (
                    <View style={styles.inlinePendingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={[styles.pendingMetaText, { color: colors.textSecondary }]}>Analyzing your activity…</Text>
                    </View>
                  ) : null}
                  {message.role === 'assistant' && message.generatedAt ? (
                    <Text style={[styles.generatedAtText, { color: colors.textSecondary }]}>
                      Generated {new Date(message.generatedAt).toLocaleTimeString()}
                    </Text>
                  ) : null}
                  {message.status === 'failed' ? (
                    <TouchableOpacity
                      style={[styles.retryButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      onPress={() => handleRetry(message.retryQuestion, message.id)}
                      disabled={!deriveCanRetryFailedMessage({ message, isLoading })}
                      disabled={!deriveCanApplyChatSuggestion({ isLoading, suggestion })}
                    activeOpacity={0.85}
                    >
                      <Ionicons name="refresh-outline" size={14} color={colors.primary} />
                      <Text style={[styles.retryButtonText, { color: colors.primary }]}>Retry</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
            ))
          )}
        </ScrollView>

        <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
            value={prompt}
            onChangeText={(value) => updateSession((current) => ({ ...current, prompt: value }))}
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
            placeholder="Why did I spend more this month?"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={300}
          />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isSubmitDisabled}
            style={[
              styles.sendButton,
              { backgroundColor: colors.primary },
              isSubmitDisabled && styles.sendButtonDisabled,
            ]}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send-outline" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: lightTheme.colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: lightTheme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.cardBackground,
  },
  titleWrap: { flex: 1, paddingRight: 8 },
  title: { fontSize: 18, fontWeight: '800', color: lightTheme.colors.text },
  subtitle: { marginTop: 2, fontSize: 12, color: lightTheme.colors.textSecondary },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.primaryLight,
  },
  threadContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  emptyState: {
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
    borderRadius: 12,
    backgroundColor: lightTheme.colors.cardBackground,
    padding: 14,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: lightTheme.colors.text,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 18,
    color: lightTheme.colors.textSecondary,
  },
  suggestionsWrap: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
    backgroundColor: '#F6F2FF',
    borderRadius: 999,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  suggestionChipText: {
    fontSize: 12,
    color: lightTheme.colors.primaryDark,
    fontWeight: '600',
  },
  messageBubble: {
    maxWidth: '88%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: lightTheme.colors.primary,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: lightTheme.colors.cardBackground,
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
  },
  userMessageText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
  },
  assistantMessageText: {
    color: lightTheme.colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  generatedAtText: {
    marginTop: 6,
    fontSize: 11,
    color: lightTheme.colors.textTertiary,
  },
  inlinePendingRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingMetaText: {
    fontSize: 12,
    color: lightTheme.colors.textSecondary,
  },
  retryButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    gap: 4,
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: lightTheme.colors.cardBackground,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: lightTheme.colors.primary,
  },
  composer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 0.5,
    borderTopColor: lightTheme.colors.border,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: lightTheme.colors.cardBackground,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: lightTheme.colors.text,
    backgroundColor: lightTheme.colors.background,
    fontSize: 14,
  },
  sendButton: {
    height: 44,
    width: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: lightTheme.colors.primary,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
