import { useEffect, useRef, useState } from "react";

import styles from "./ChatPanel.module.css";

import type { ChatMessage } from "@/api/client";

import { useChat } from "@/api/client";
import { useAppStore } from "@/stores/appStore";

const DEFAULT_CHIPS = [
  "Build a day-by-day itinerary",
  "How long at each stop?",
  "Best time of year to go",
  "Nearby places to add",
  "Packing list",
  "Rough budget estimate",
];

interface Props {
  tripId: string;
  onClose: () => void;
}

export default function ChatPanel({ tripId, onClose }: Props) {
  const { userId } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chips, setChips] = useState<string[]>(DEFAULT_CHIPS);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { mutateAsync: sendChat, isPending } = useChat();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  async function send(text: string) {
    if (!text.trim() || isPending) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const { reply, suggestionChips } = await sendChat({
        tripId,
        message: userMsg.content,
        history: messages,
        ...(userId ? { userId } : {}),
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (suggestionChips?.length) setChips(suggestionChips);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.avatar}>AI</div>
          <div>
            <div className={styles.name}>Travel Assistant</div>
            <div className={styles.sub}>Powered by GPT-4o</div>
          </div>
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <p>Ask me anything about your trip — itinerary, timing, budget, or what to pack.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.bubble} ${msg.role === "user" ? styles.user : styles.assistant}`}
          >
            {msg.role === "assistant" && <div className={styles.bubbleAvatar}>AI</div>}
            <div className={styles.bubbleText}>
              {msg.content.split("\n").map((line, j) => (
                <span key={j}>
                  {line}
                  {j < msg.content.split("\n").length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}

        {isPending && (
          <div className={`${styles.bubble} ${styles.assistant}`}>
            <div className={styles.bubbleAvatar}>AI</div>
            <div className={styles.typing}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggestion chips */}
      {messages.length === 0 && (
        <div className={styles.chips}>
          {chips.slice(0, 6).map((chip) => (
            <button
              key={chip}
              className={styles.chip}
              onClick={() => send(chip)}
              disabled={isPending}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <div className={styles.inputRow}>
        <textarea
          ref={inputRef}
          className={styles.input}
          rows={1}
          placeholder="Ask about your trip…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
        />
        <button
          className={styles.sendBtn}
          onClick={() => send(input)}
          disabled={!input.trim() || isPending}
          aria-label="Send message"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
