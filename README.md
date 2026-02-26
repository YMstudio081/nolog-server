# nolog-server
WebSocket relay server for NOLOG

---

## クライアント接続（NOLOGアプリ側）

本番サーバー（Render）に接続するには、NOLOGアプリで以下を実施してください。

### 1. 定数ファイル

`src/constants/config.ts` を用意（無ければ新規作成）:

```ts
export const WS_URL = "wss://nolog-server.onrender.com";
```

- 接続URLは上記に統一し、ハードコード禁止。
- 将来の環境切替に備え定数化すること。

### 2. useWebSocket の修正

既存の `new WebSocket("ws://localhost:3000")` や `new WebSocket(SOME_URL)` を、次のように変更:

```ts
import { WS_URL } from "@/constants/config";
const socket = new WebSocket(WS_URL);
```

### 3. 接続ログの追加（useWebSocket 内）

```ts
socket.onopen = () => {
  console.log("[WS] connected:", WS_URL);
};
socket.onerror = (err) => {
  console.log("[WS] error:", err);
};
socket.onclose = (e) => {
  console.log("[WS] closed:", e.code, e.reason);
};
```

### 4. join 送信の確認

接続成功後にルーム参加メッセージを送信していること:

```ts
socket.send(JSON.stringify({
  type: "join",
  roomId: roomId,
}));
```

参照実装は `client-reference/useWebSocket.example.ts` を参照。

---

### 確認手順

1. アプリ起動
2. ブラウザコンソールで WebSocket 接続ログを確認（`[WS] connected: wss://...`）
3. Render の Logs に `connection` が出力されること
4. 同一ルームで 2 端末から message を送信し、相互に受信できること
