/**
 * apps/mobile/components/ChatDrawer.tsx
 *
 * Task 11 — Mobile AI chat drawer.
 * Slides up from the bottom of the trip map screen.
 * Message bubbles, typing indicator, suggestion chips,
 * persistent session history for the current screen.
 */
import { useRef, useState } from "react";
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
import { useChat } from "@/api/client";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const SURFACE3 = "#2a2a28";
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
}

interface Props {
  tripId: string;
  onClose: () => void;
}

function TypingDots() {
  return (
    <View style={styles.bubble}>
      <View style={styles.aiBubble}>
        <View style={styles.dotsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.dot} />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function ChatDrawer({ tripId, onClose }: Props) {
  const { userId } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chips, setChips] = useState(DEFAULT_CHIPS);
  const listRef = useRef<FlatList>(null);
  const { mutateAsync: sendChat, isPending } = useChat();

  async function send(text: string) {
    if (!text.trim() || isPending) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { reply, suggestionChips } = await sendChat({
        tripId,
        message: userMsg.content,
        history: messages,
        userId: userId ?? undefined,
      });
      setMessages([...updated, { role: "assistant", content: reply }]);
      if (suggestionChips?.length) setChips(suggestionChips.slice(0, 6));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setMessages([
        ...updated,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    }
  }

  function renderItem({ item }: { item: Message }) {
    const isUser = item.role === "user";
    return (
      <View style={[styles.bubble, isUser && styles.userBubbleWrap]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Text style={styles.aiAvatarText}>AI</Text>
          </View>
        )}
        <View style={[isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.bubbleText, isUser && styles.userBubbleText]}>
            {item.content}
          </Text>
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
            <Text style={styles.headerSub}>Powered by GPT-4o</Text>
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
        ListFooterComponent={isPending ? <TypingDots /> : null}
        showsVerticalScrollIndicator={false}
      />

      {/* Suggestion chips (shown when no messages yet) */}
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
              disabled={isPending}
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
          onSubmitEditing={() => { if (!isPending) send(input); }}
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || isPending) && styles.sendBtnDisabled]}
          onPress={() => send(input)}
          disabled={!input.trim() || isPending}
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
    bottom: 0, left: 0, right: 0,
    height: "60%",
    backgroundColor: SURFACE,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4, shadowRadius: 12,
    elevation: 20,
  },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { color: TEXT, fontSize: 14, fontWeight: "700" },
  headerSub: { color: MUTED, fontSize: 11, marginTop: 1 },
  closeBtn: { padding: 6 },
  closeBtnText: { color: MUTED, fontSize: 16 },

  aiAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: CORAL,
    alignItems: "center", justifyContent: "center",
  },
  aiAvatarText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  messageList: { padding: 12, gap: 10, flexGrow: 1 },

  empty: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center" },
  emptyText: { color: MUTED, fontSize: 13, textAlign: "center", lineHeight: 20 },

  bubble: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  userBubbleWrap: { justifyContent: "flex-end" },

  aiBubble: {
    backgroundColor: SURFACE2, borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 10, maxWidth: "80%",
  },
  userBubble: {
    backgroundColor: CORAL, borderRadius: 16,
    borderBottomRightRadius: 4,
    padding: 10, maxWidth: "80%",
  },
  bubbleText: { color: TEXT, fontSize: 13, lineHeight: 19 },
  userBubbleText: { color: "#fff" },

  dotsRow: { flexDirection: "row", gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: MUTED },

  chips: {
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: BORDER,
    backgroundColor: SURFACE2,
  },
  chipText: { color: MUTED, fontSize: 12, fontWeight: "500" },

  inputRow: {
    flexDirection: "row", gap: 8, padding: 12,
    borderTopWidth: 1, borderTopColor: BORDER,
    alignItems: "flex-end",
  },
  input: {
    flex: 1, backgroundColor: SURFACE2,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 10, color: TEXT, fontSize: 13,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CORAL,
    alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: "#fff", fontSize: 18, fontWeight: "300", marginTop: -2 },
});
