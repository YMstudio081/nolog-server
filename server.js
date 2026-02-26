const WebSocket = require("ws");

const LOG_LEVEL = process.env.LOG_LEVEL || "dev";
const safeLog = (...args) => {
  if (LOG_LEVEL === "dev") console.log(...args);
};
const safeError = (...args) => console.error(...args);

const PORT = process.env.PORT || 3001;

const wss = new WebSocket.Server({
  port: PORT,
  host: "0.0.0.0",
});

const rooms = new Map();

const genPeerId = () =>
  Math.random().toString(36).slice(2, 8);

const sendJson = (ws, obj) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
};

safeLog("✅ NOLOG WS SERVER RUNNING");
safeLog(`LISTEN HOST: 0.0.0.0`);
safeLog(`LISTEN PORT: ${PORT}`);

wss.on("connection", (ws) => {
  ws.__peerId = genPeerId();
  ws.__roomId = null;
  ws.__publicKey = null; // ★ 追加：サーバー保持

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
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

      ws.__roomId = roomId;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      const clients = rooms.get(roomId);
      clients.add(ws);

      // 自分へjoined通知
      sendJson(ws, {
        type: "joined",
        peerId: ws.__peerId,
      });

      // ★ 既存peerへ接続通知
      for (const client of clients) {
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
      ws.__publicKey = data.key; // ★ サーバー保存

      for (const client of clients) {
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
    for (const client of clients) {
      if (client !== ws) {
        sendJson(client, data);
      }
    }
  });

  ws.on("close", () => {
    const roomId = ws.__roomId;
    if (!roomId) return;

    const clients = rooms.get(roomId);
    if (!clients) return;

    clients.delete(ws);

    for (const client of clients) {
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
    safeError("WebSocket error:", err);
  });
});
