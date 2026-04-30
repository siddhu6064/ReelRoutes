import { useCallback, useEffect, useRef, useState } from "react";

import type { JobStatus } from "../api/client";

type WsState = "connecting" | "open" | "closed" | "error";

interface WsMessage {
  ok: boolean;
  data: JobStatus;
}

interface UseJobWebSocketResult {
  status: JobStatus | null;
  wsState: WsState;
}

const WS_BASE: string =
  (import.meta.env["VITE_WS_URL"] as string | undefined) ?? `ws://${window.location.host}`;

/**
 * Connects to ws/jobs/:jobId for real-time job progress.
 * Falls back to polling GET /api/jobs/:jobId every 3s if WebSocket fails.
 * Automatically disconnects when the job reaches a terminal state.
 */
export function useJobWebSocket(jobId: string | null): UseJobWebSocketResult {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [wsState, setWsState] = useState<WsState>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTerminal = (s: JobStatus | null): boolean =>
    s?.status === "completed" || s?.status === "failed";

  const startPolling = useCallback((id: string): void => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/jobs/${id}`);
          const json = (await res.json()) as WsMessage;
          if (json.ok) {
            setStatus(json.data);
            if (isTerminal(json.data)) {
              clearInterval(pollRef.current!);
              pollRef.current = null;
            }
          }
        } catch {
          // network error — keep polling
        }
      })();
    }, 3000);
  }, []);

  useEffect((): (() => void) => {
    if (!jobId) return () => undefined;

    let ws: WebSocket;
    let usedPolling = false;

    try {
      ws = new WebSocket(`${WS_BASE}/ws/jobs/${jobId}`);
      wsRef.current = ws;
      setWsState("connecting");

      ws.onopen = (): void => setWsState("open");

      ws.onmessage = (evt: MessageEvent): void => {
        try {
          const msg = JSON.parse(evt.data as string) as WsMessage;
          if (msg.ok) setStatus(msg.data);
        } catch {
          /* ignore malformed messages */
        }
      };

      ws.onerror = (): void => {
        setWsState("error");
        if (!usedPolling) {
          usedPolling = true;
          startPolling(jobId);
        }
      };

      ws.onclose = (): void => {
        setWsState("closed");
        setStatus((prev) => {
          if (!isTerminal(prev) && !usedPolling) {
            usedPolling = true;
            startPolling(jobId);
          }
          return prev;
        });
      };
    } catch {
      setWsState("error");
      startPolling(jobId);
    }

    return (): void => {
      wsRef.current?.close();
      wsRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobId, startPolling]);

  return { status, wsState };
}
