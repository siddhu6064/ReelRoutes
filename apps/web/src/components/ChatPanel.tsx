import { useEffect, useRef, useState } from "react";

import styles from "./ChatPanel.module.css";

import type { ChatMessage } from "@/api/client";

import { streamChat } from "@/api/client";
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

interface Message extends ChatMessage {
  done?: boolean;
}

export default function ChatPanel({ tripId, onClose }: Props) {
  const { userId } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chips] = useState<string[]>(DEFAULT_CHIPS);
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function send(text: string) {
    if (!text.trim() || isStreaming) return;
    const userMsg: Message = { role: "user", content: text.trim(), done: true };
    const assistantPlaceholder: Message = { role: "assistant", content: "", done: false };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setInput("");
    setIsStreaming(true);

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
            <div className={styles.sub}>Powered by GPT-4o · Streaming</div>
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

        {messages.map((msg, i) => {
          const isLiveAssistant = msg.role === "assistant" && i === messages.length - 1 && !msg.done;
          return (
            <div
              key={i}
              className={`${styles.bubble} ${msg.role === "user" ? styles.user : styles.assistant}`}
            >
              {msg.role === "assistant" && <div className={styles.bubbleAvatar}>AI</div>}
              <div className={styles.bubbleText}>
                {msg.content === "" && !msg.done ? (
                  <div className={styles.typing}>
                    <span />
                    <span />
                    <span />
                  </div>
                ) : (
                  <>
                    {msg.content.split("\n").map((line, j, arr) => (
                      <span key={j}>
                        {line}
                        {j < arr.length - 1 && <br />}
                      </span>
                    ))}
                    {isLiveAssistant && (
                      <span className={styles.cursor} aria-hidden="true">▋</span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {messages.length === 0 && (
        <div className={styles.chips}>
          {chips.slice(0, 6).map((chip) => (
            <button
              key={chip}
              className={styles.chip}
              onClick={() => send(chip)}
              disabled={isStreaming}
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
          disabled={!input.trim() || isStreaming}
          aria-label="Send message"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
