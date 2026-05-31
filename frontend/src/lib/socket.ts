import { useCallback, useEffect, useRef, useState } from "react";

const explicitWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
const explicitBackendPort = import.meta.env.VITE_BACKEND_PORT as string | undefined;

type SocketOptions = {
  adminPassword?: string;
  allowBrowserWsOverride?: boolean;
  enabled?: boolean;
};

function normalizeWsUrl(value: string) {
  if (value.startsWith("ws://") || value.startsWith("wss://")) return value;
  if (value.startsWith("http://")) return value.replace(/^http:\/\//, "ws://");
  if (value.startsWith("https://")) return value.replace(/^https:\/\//, "wss://");
  return value;
}

export function getWsUrl({ allowBrowserOverride = true }: { allowBrowserOverride?: boolean } = {}) {
  const params = new URLSearchParams(window.location.search);
  const queryWsUrl = params.get("ws");
  if (allowBrowserOverride && queryWsUrl) {
    const normalized = normalizeWsUrl(queryWsUrl);
    localStorage.setItem("row_rush_ws_url", normalized);
    return normalized;
  }

  const storedWsUrl = localStorage.getItem("row_rush_ws_url");
  if (allowBrowserOverride && storedWsUrl) return storedWsUrl;
  if (explicitWsUrl) return normalizeWsUrl(explicitWsUrl);

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = import.meta.env.DEV
    ? `${window.location.hostname || "127.0.0.1"}:${explicitBackendPort || "8000"}`
    : window.location.host;
  return `${protocol}://${host}/ws`;
}

export function useRowRushSocket<T>(role: "player" | "admin" | "projector", options: SocketOptions = {}) {
  const adminPassword = options.adminPassword;
  const enabled = options.enabled ?? true;
  const allowBrowserWsOverride = options.allowBrowserWsOverride ?? role !== "admin";
  const [state, setState] = useState<T | null>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [lastError, setLastError] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<string[]>([]);

  useEffect(() => {
    if (!enabled) {
      setState(null);
      setStatus("closed");
      setLastError("");
      queueRef.current = [];
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let closedByEffect = false;
    let reconnectTimer = 0;
    let reconnectAttempt = 0;

    const connect = () => {
      setStatus("connecting");
      const socket = new WebSocket(getWsUrl({ allowBrowserOverride: allowBrowserWsOverride }));
      wsRef.current = socket;

      socket.onopen = () => {
        setStatus("open");
        setLastError("");
        reconnectAttempt = 0;
        socket.send(
          JSON.stringify({
            type: "identify",
            role,
            player_id: localStorage.getItem("row_rush_player_id"),
            ...(role === "admin" ? { admin_password: adminPassword } : {}),
          }),
        );
        for (const item of queueRef.current.splice(0)) {
          socket.send(item);
        }
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === "joined" && payload.player_id) {
          localStorage.setItem("row_rush_player_id", payload.player_id);
          socket.send(JSON.stringify({ type: "identify", role: "player", player_id: payload.player_id }));
          return;
        }
        if (payload.type === "error") {
          setLastError(payload.message);
          return;
        }
        if (payload.type === "admin_auth") {
          setLastError("");
          return;
        }
        if (payload.type === "selection_result") {
          window.dispatchEvent(new CustomEvent("row-rush-selection", { detail: payload }));
          return;
        }
        setState(payload);
      };

      socket.onclose = () => {
        setStatus("closed");
        if (!closedByEffect) {
          reconnectAttempt += 1;
          const delay = Math.min(10000, 800 * 2 ** Math.min(reconnectAttempt - 1, 4));
          reconnectTimer = window.setTimeout(connect, delay);
        }
      };

      socket.onerror = () => {
        setLastError("Connection problem");
      };
    };

    connect();
    return () => {
      closedByEffect = true;
      window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [adminPassword, allowBrowserWsOverride, enabled, role]);

  const send = useCallback((payload: unknown) => {
    const text = JSON.stringify(payload);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(text);
    } else {
      queueRef.current.push(text);
    }
  }, []);

  return { state, status, lastError, send };
}
