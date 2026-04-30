/**
 * apps/mobile/components/ChatDrawer.tsx
 *
 * AI travel assistant — streaming SSE version.
 * Tokens arrive one-by-one from GPT-4o and render progressively.
 */
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";

import { streamChat } from "@/api/client";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";

const DEFAULT_CHIPS = [
  "Build a day-by-day itinerary",
  "How long at each stop?",
  "Best time of year to go",
  "Packing list",
  "Budget estimate",
  "Nearby places to add",
];

interface Message {
  role: "user" | "assistant";
  content: string;
  done?: boolean;
}

interface Props {
  tripId: string;
  onClose: () => void;
}

export default function ChatDrawer({ tripId, onClose }: Props) {
  const { userId } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chips] = useState(DEFAULT_CHIPS);
  const [isStreaming, setIsStreaming] = useState(false);
  const listRef = useRef<FlatList>(null);
  const abortRef = useRef<ReturnType<typeof streamChat> | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function scrollToEnd(): void {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }

  function send(text: string): void {
    if (!text.trim() || isStreaming) return;
    const userMsg: Message = { role: "user", content: text.trim(), done: true };
    const placeholder: Message = { role: "assistant", content: "", done: false };

    setMessages((prev) => [...prev, userMsg, placeholder]);
    setInput("");
    setIsStreaming(true);
    scrollToEnd();

    // exactOptionalPropertyTypes: only pass userId when it exists
    abortRef.current = streamChat({
      tripId,
      message: userMsg.content,
      history: messages.filter((m) => m.done).map(({ role, content }) => ({ role, content })),
      ...(userId ? { userId } : {}),

      onToken: (token) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && !last.done) {
            next[next.length - 1] = { ...last, content: last.content + token };
          }
          return next;
        });
        scrollToEnd();
      },

      onDone: () => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, done: true };
          }
          return next;
        });
        setIsStreaming(false);
        abortRef.current = null;
      },

      onError: (msg) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { role: "assistant", content: msg, done: true };
          }
          return next;
        });
        setIsStreaming(false);
        abortRef.current = null;
      },
    });
  }

  function renderItem({ item, index }: { item: Message; index: number }): React.ReactElement {
    const isUser = item.role === "user";
    const isLive = !isUser && index === messages.length - 1 && !item.done;

    return (
      <View style={[styles.bubble, isUser && styles.userBubbleWrap]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Text style={styles.aiAvatarText}>AI</Text>
          </View>
        )}
        <View style={isUser ? styles.userBubble : styles.aiBubble}>
          {item.content === "" && !item.done ? (
            <View style={styles.dotsRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.dot} />
              ))}
            </View>
          ) : (
            <Text style={[styles.bubbleText, isUser && styles.userBubbleText]}>
              {item.content}
              {isLive ? "▋" : ""}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.drawer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.aiAvatar}>
            <Text style={styles.aiAvatarText}>AI</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Travel Assistant</Text>
            <Text style={styles.headerSub}>GPT-4o · Streaming</Text>
          </View>
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              Ask me anything about your trip — itinerary, timing, budget, or what to pack.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Suggestion chips */}
      {messages.length === 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {chips.map((chip) => (
            <Pressable
              key={chip}
              style={styles.chip}
              onPress={() => send(chip)}
              disabled={isStreaming}
            >
              <Text style={styles.chipText}>{chip}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Input row */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your trip…"
          placeholderTextColor={MUTED}
          multiline
          maxLength={2000}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            if (!isStreaming) send(input);
          }}
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || isStreaming) && styles.sendBtnDisabled]}
          onPress={() => send(input)}
          disabled={!input.trim() || isStreaming}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "60%",
    backgroundColor: SURFACE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { color: TEXT, fontSize: 14, fontWeight: "700" },
  headerSub: { color: MUTED, fontSize: 11, marginTop: 1 },
  closeBtn: { padding: 6 },
  closeBtnText: { color: MUTED, fontSize: 16 },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CORAL,
    alignItems: "center",
    justifyContent: "center",
  },
  aiAvatarText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  messageList: { padding: 12, gap: 10, flexGrow: 1 },
  empty: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center" },
  emptyText: { color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 20 },
  bubble: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  userBubbleWrap: { justifyContent: "flex-end" },
  aiBubble: {
    backgroundColor: SURFACE2,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 10,
    maxWidth: "80%",
  },
  userBubble: {
    backgroundColor: CORAL,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    padding: 10,
    maxWidth: "80%",
  },
  bubbleText: { color: TEXT, fontSize: 13, lineHeight: 19 },
  userBubbleText: { color: "#fff" },
  dotsRow: { flexDirection: "row", gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: MUTED },
  chips: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE2,
  },
  chipText: { color: MUTED, fontSize: 12, fontWeight: "500" },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    backgroundColor: SURFACE2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    color: TEXT,
    fontSize: 13,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CORAL,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: "#fff", fontSize: 18, fontWeight: "300", marginTop: -2 },
});
