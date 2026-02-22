const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;

// HTTPサーバー作成（Renderが監視するため必須）
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("NOLOG WebSocket Server Running");
});

// WebSocketサーバー
const wss = new WebSocketServer({ server });

const rooms = new Map();

wss.on("connection", (ws, req) => {
  let currentRoom = null;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      // join のみ特別扱い
      if (data.type === "join") {
        currentRoom = data.roomId;

        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, new Set());
        }

        rooms.get(currentRoom).add(ws);
        return;
      }

      // join 以外はすべて room 内に relay
      if (currentRoom) {
        const clients = rooms.get(currentRoom);
        if (!clients) return;

        for (const client of clients) {
          if (client.readyState === 1) {
            client.send(JSON.stringify(data));
          }
        }
      }

    } catch (err) {
      console.error("Invalid message:", err);
    }
  });

  ws.on("close", () => {
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(ws);
    }
  });
});

server.listen(PORT, () => {
  console.log("NOLOG WebSocket server running on port", PORT);
});
