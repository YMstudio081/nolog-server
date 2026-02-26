/**
 * NOLOG クライアント用 useWebSocket 参照実装
 * アプリ側で useWebSocket を使用しているファイルをこの仕様に合わせて修正してください。
 *
 * 1. 定数: import { WS_URL } from "@/constants/config";
 * 2. 接続: const socket = new WebSocket(WS_URL);
 * 3. 接続ログ（onopen / onerror / onclose）
 * 4. 接続成功後に join 送信
 */

import { WS_URL } from "@/constants/config";
import { useEffect, useRef, useState } from "react";

export function useWebSocket(roomId: string | null) {
  const [readyState, setReadyState] = useState<number>(WebSocket.CLOSED);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("[WS] connected:", WS_URL);
      setReadyState(WebSocket.OPEN);
      socket.send(
        JSON.stringify({
          type: "join",
          roomId,
        })
      );
    };

    socket.onerror = (err) => {
      console.log("[WS] error:", err);
    };

    socket.onclose = (e) => {
      console.log("[WS] closed:", e.code, e.reason);
      setReadyState(WebSocket.CLOSED);
      socketRef.current = null;
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [roomId]);

  const send = (data: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        typeof data === "string" ? data : JSON.stringify(data)
      );
    }
  };

  return { socket: socketRef.current, readyState, send };
}
