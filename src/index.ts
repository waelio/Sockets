// ─── Types ────────────────────────────────────────────────────────────────────

export type WsMessageType = string;

export interface WsMessage {
  type: WsMessageType;
  [key: string]: unknown;
}

export type WsHandler<T = WsMessage> = (msg: T) => void;

export interface WaelioSocketOptions {
  /** Automatically reconnect on unexpected close. Default: true */
  reconnect?: boolean;
  /** Max reconnect attempts. Default: 5 */
  maxRetries?: number;
  /** Base delay between reconnect attempts in ms. Default: 1000 */
  retryDelay?: number;
  /** Heartbeat interval in ms (0 = disabled). Default: 0 */
  heartbeatInterval?: number;
}

// ─── WaelioSocket ─────────────────────────────────────────────────────────────

/**
 * A lightweight, typed WebSocket client.
 *
 * @example
 * ```ts
 * import { WaelioSocket } from '@waelio/sockets';
 *
 * const ws = new WaelioSocket('wss://example.com/ws');
 *
 * ws.on('chat:message', (msg) => console.log(msg));
 * ws.onOpen(() => ws.send({ type: 'join', room: 'general' }));
 *
 * ws.connect();
 * ```
 */
export class WaelioSocket {
  private readonly url: string;
  private readonly options: Required<WaelioSocketOptions>;

  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<WsHandler>>();
  private openHandlers = new Set<() => void>();
  private closeHandlers = new Set<(ev: CloseEvent) => void>();
  private errorHandlers = new Set<(ev: Event) => void>();

  private retries = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _destroyed = false;

  constructor(url: string, options: WaelioSocketOptions = {}) {
    this.url = url;
    this.options = {
      reconnect: options.reconnect ?? true,
      maxRetries: options.maxRetries ?? 5,
      retryDelay: options.retryDelay ?? 1000,
      heartbeatInterval: options.heartbeatInterval ?? 0,
    };
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  connect(): this {
    if (this._destroyed) return this;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return this;
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = (_ev: Event): void => {
      this.retries = 0;
      this._startHeartbeat();
      for (const fn of this.openHandlers) fn();
    };

    this.ws.onmessage = (ev: MessageEvent<string>): void => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(ev.data) as WsMessage;
      } catch {
        console.warn('[WaelioSocket] non-JSON message received:', ev.data);
        return;
      }
      const type = String(msg.type ?? '');
      const fns = this.handlers.get(type);
      if (fns) {
        for (const fn of fns) fn(msg);
      }
      // wildcard listeners
      const wild = this.handlers.get('*');
      if (wild) {
        for (const fn of wild) fn(msg);
      }
    };

    this.ws.onerror = (ev: Event): void => {
      for (const fn of this.errorHandlers) fn(ev);
    };

    this.ws.onclose = (ev: CloseEvent): void => {
      this._stopHeartbeat();
      for (const fn of this.closeHandlers) fn(ev);
      if (!this._destroyed && this.options.reconnect && !ev.wasClean) {
        this._scheduleReconnect();
      }
    };

    return this;
  }

  disconnect(): this {
    this._destroyed = true;
    this._stopHeartbeat();
    this._cancelReconnect();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
    return this;
  }

  // ── Sending ────────────────────────────────────────────────────────────────

  send(payload: WsMessage | object): this {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.warn('[WaelioSocket] send() called while not connected');
    }
    return this;
  }

  // ── Event Listeners ────────────────────────────────────────────────────────

  /** Listen for a specific message type (or `'*'` for all messages). */
  on<T extends WsMessage = WsMessage>(type: string, handler: WsHandler<T>): this {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler as WsHandler);
    return this;
  }

  /** Remove a specific message-type listener. */
  off(type: string, handler: WsHandler): this {
    this.handlers.get(type)?.delete(handler);
    return this;
  }

  /** Called once the WebSocket connection is open. */
  onOpen(handler: () => void): this {
    this.openHandlers.add(handler);
    return this;
  }

  /** Called when the WebSocket connection closes. */
  onClose(handler: (ev: CloseEvent) => void): this {
    this.closeHandlers.add(handler);
    return this;
  }

  /** Called when the WebSocket encounters an error. */
  onError(handler: (ev: Event) => void): this {
    this.errorHandlers.add(handler);
    return this;
  }

  // ── State ──────────────────────────────────────────────────────────────────

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _startHeartbeat(): void {
    if (!this.options.heartbeatInterval) return;
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping', ts: Date.now() });
    }, this.options.heartbeatInterval);
  }

  private _stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _scheduleReconnect(): void {
    if (this.retries >= this.options.maxRetries) {
      console.warn('[WaelioSocket] max retries reached, giving up');
      return;
    }
    const delay = this.options.retryDelay * Math.pow(2, this.retries);
    this.retries++;
    console.log(`[WaelioSocket] reconnecting in ${delay}ms (attempt ${this.retries})`);
    this.reconnectTimer = setTimeout(() => {
      this._destroyed = false;
      this.connect();
    }, delay);
  }

  private _cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Convenience factory — creates and immediately connects a WaelioSocket.
 *
 * @example
 * ```ts
 * import { createSocket } from '@waelio/sockets';
 * const ws = createSocket('wss://example.com/ws');
 * ws.on('chat:message', console.log);
 * ```
 */
export function createSocket(
  url: string,
  options?: WaelioSocketOptions
): WaelioSocket {
  return new WaelioSocket(url, options).connect();
}
