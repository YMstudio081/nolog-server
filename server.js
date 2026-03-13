const WebSocket = require("ws");

console.log("[AUDIT][SERVER_FILE] server.js loaded");
console.log("[AUDIT][ENV_PORT]", process.env.PORT);
console.log("[AUDIT][NODE_VERSION]", process.version);
console.log("[AUDIT][PID]", process.pid);

const LOG_LEVEL = process.env.LOG_LEVEL || "dev";
const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB
const MAX_ROOM_SIZE = 2;
const safeLog = (...args) => {
  if (LOG_LEVEL === "dev") console.log(...args);
};
const safeError = (...args) => console.error(...args);

const PORT = process.env.PORT || 3001;

const wss = new WebSocket.Server({
  port: PORT,
  host: "0.0.0.0",
});

console.log("[AUDIT][WS_SERVER_CREATED]");
if (wss && wss.options) {
  console.log("[AUDIT][WS_OPTIONS]", wss.options);
}

const rooms = new Map();

const genPeerId = () =>
  Math.random().toString(36).slice(2, 10);

function sendJson(ws, data) {
  try {
    if (!ws) return;
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(data));
  } catch (err) {
    safeError("SEND FAIL:", err);
  }
}

wss.on("connection", (ws, req) => {
  console.log("[AUDIT][WS_CONNECTION]");
  console.log("[AUDIT][WS_HEADERS]", req?.headers);
  console.log("[AUDIT][REMOTE_IP]", req?.socket?.remoteAddress);

  safeLog("NEW CONNECTION");
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.__peerId = genPeerId();
  ws.__roomId = null;
  ws.__publicKey = null; // ★ 追加：サーバー保持

  ws.on("message", (raw) => {
    console.log(
      "[AUDIT][WS_MESSAGE_RAW]",
      raw?.toString()?.slice(0, 120)
    );

    const rawStr = typeof raw === "string" ? raw : raw.toString();

    if (rawStr.length > MAX_MESSAGE_SIZE) {
      safeError("MESSAGE TOO LARGE");
      return;
    }

    let data;
    try {
      data = JSON.parse(rawStr);

      if (!data || typeof data !== "object") {
        safeError("INVALID MESSAGE OBJECT");
        return;
      }

      if (typeof data.type !== "string") {
        safeError("INVALID MESSAGE TYPE");
        return;
      }
    } catch (err) {
      safeError("Invalid JSON:", err);
      return;
    }

    // ─────────────────────────────
    // JOIN
    // ─────────────────────────────
    if (data.type === "join") {

      const roomId = data.roomId;
      if (!roomId) return;
      if (typeof roomId !== "string") return;

      if (roomId.length > 64) {
        safeError("ROOMID TOO LONG");
        return;
      }

      // 同一ルーム再JOIN防止
      if (ws.__roomId === roomId) {
        safeLog("[JOIN DUP BLOCKED]", roomId, ws.__peerId);
        return;
      }

      ws.__roomId = roomId;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      const clients = rooms.get(roomId);

      if (clients.size >= MAX_ROOM_SIZE) {
        safeLog("ROOM FULL", roomId);
        sendJson(ws, { type: "roomFull" });
        return;
      }

      clients.add(ws);

      // 自分へjoined通知
      sendJson(ws, {
        type: "joined",
        peerId: ws.__peerId,
      });

      // ★ 既存peerへ接続通知
      const snapshot = [...clients];
      for (const client of snapshot) {
        if (client === ws) continue;

        sendJson(client, {
          type: "peerConnected",
          peerId: ws.__peerId,
        });

        sendJson(ws, {
          type: "peerConnected",
          peerId: client.__peerId,
        });

        // ★ 既存peerのpublicKeyを新規参加者へ送信
        if (client.__publicKey) {
          sendJson(ws, {
            type: "publicKey",
            key: client.__publicKey,
          });
        }
      }

      safeLog("[JOIN]", roomId, ws.__peerId);
      return;
    }

    const roomId = ws.__roomId;
    if (!roomId) return;

    const clients = rooms.get(roomId);
    if (!clients) return;

    // ─────────────────────────────
    // PUBLIC KEY
    // ─────────────────────────────
    if (data.type === "publicKey" && data.key) {
      if (typeof data.key !== "string") return;

      if (data.key.length > 4096) {
        safeError("PUBLICKEY TOO LARGE");
        return;
      }

      ws.__publicKey = data.key; // ★ サーバー保存

      const snapshot = [...clients];
      for (const client of snapshot) {
        if (client !== ws) {
          sendJson(client, {
            type: "publicKey",
            key: data.key,
          });
        }
      }

      safeLog("[PUBLICKEY]", roomId, ws.__peerId);
      return;
    }

    // ─────────────────────────────
    // その他メッセージ relay（エコーバック防止）
    // ─────────────────────────────
    let payloadSize = 0;

    try {
      payloadSize = JSON.stringify(data).length;
    } catch (err) {
      safeError("PAYLOAD STRINGIFY FAIL");
      return;
    }

    if (payloadSize > MAX_MESSAGE_SIZE) {
      safeError("PAYLOAD TOO LARGE");
      return;
    }

    const snapshot = [...clients];
    for (const client of snapshot) {
      if (client !== ws) {
        sendJson(client, data);
      }
    }
  });

  ws.on("close", () => {
    console.log("[AUDIT][WS_CLOSE]");
    const roomId = ws.__roomId;
    if (!roomId) return;

    const clients = rooms.get(roomId);
    if (!clients) return;

    clients.delete(ws);

    const snapshot = [...clients];
    for (const client of snapshot) {
      sendJson(client, {
        type: "peerLeft",
        peerId: ws.__peerId,
      });
    }

    if (clients.size === 0) {
      rooms.delete(roomId);
      safeLog("ROOM DELETED:", roomId);
    }
  });

  ws.on("error", (err) => {
    console.log("[AUDIT][WS_ERROR]", err?.message);
    safeError("WebSocket error:", err);
  });
});

const HEARTBEAT_INTERVAL = 30000;

setInterval(() => {
  const snapshot = [...wss.clients];

  for (const ws of snapshot) {
    if (ws.isAlive === false) {
      safeLog("TERMINATE DEAD SOCKET");
      ws.terminate();
      continue;
    }

    ws.isAlive = false;

    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.ping();
      } catch (err) {
        safeError("PING FAIL:", err);
      }
    }
  }
}, HEARTBEAT_INTERVAL);
