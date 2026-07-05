# @waelio/sockets

Lightweight, typed native **WebSocket client** for browser and Node.js — no Socket.io, no dependencies.

## Install

```bash
npm install @waelio/sockets
```

## Usage

```ts
import { createSocket, WaelioSocket } from '@waelio/sockets';

// Quick connect
const ws = createSocket('wss://your-server.com/ws');

ws.on('chat:message', (msg) => console.log(msg));
ws.on('*', (msg) => console.log('any message:', msg));

ws.send({ type: 'chat:message', text: 'Hello!', author: 'waelio' });
```

## Class API

```ts
const ws = new WaelioSocket('wss://...', {
  reconnect: true,       // auto-reconnect on unexpected close
  maxRetries: 5,         // max reconnect attempts
  retryDelay: 1000,      // base delay (exponential backoff)
  heartbeatInterval: 0,  // send ping every N ms (0 = off)
});

ws.connect();
ws.on('server:id', (msg) => console.log('my id:', msg.id));
ws.onOpen(() => console.log('connected'));
ws.onClose((ev) => console.log('closed', ev.code));
ws.onError((ev) => console.error('error', ev));

ws.send({ type: 'ping' });
ws.off('server:id', handler);
ws.disconnect();

ws.isConnected  // boolean
ws.readyState   // WebSocket.OPEN / CONNECTING / CLOSED / CLOSING
```

## License

MIT © [Wael Wahbeh](https://waelio.com)