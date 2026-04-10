export interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId: string | undefined;
  name: string;
  kind: number;
  startTime: string;
  endTime: string;
  attributes: Record<string, unknown>;
  status: { code: number; description?: string };
}

export interface SubscriptionFilter {
  sessionId?: string;
  traceId?: string;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelayMs = 1000;
  private reconnectMaxDelayMs = 30000;
  private filter: SubscriptionFilter = {};
  private isRunning = false;
  private messageQueue: SpanData[] = [];
  private maxQueueSize = 1000;
  private resolveNext: ((span: SpanData) => void) | null = null;

  constructor(url?: string) {
    this.url = url ?? Deno.env.get("TUI_WS_URL") ?? "ws://localhost:8080/ws/stream";
  }

  async *connect(filter?: SubscriptionFilter): AsyncGenerator<SpanData> {
    if (filter) {
      this.filter = filter;
    }

    this.isRunning = true;
    this.reconnectAttempts = 0;

    while (this.isRunning) {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onmessage = (event) => {
          if (typeof event.data === "string") {
            try {
              const data = JSON.parse(event.data);
              if (data.type === "span" && data.span) {
                const span = data.span as SpanData;
                if (this.resolveNext) {
                  this.resolveNext(span);
                  this.resolveNext = null;
                } else {
                  if (this.messageQueue.length >= this.maxQueueSize) {
                  this.messageQueue.shift();
                }
                this.messageQueue.push(span);
                }
              }
            } catch {
              // Skip malformed messages
            }
          }
        };

        this.ws.onerror = () => {
          // Error handling done in onclose
        };

        this.ws.onclose = () => {
          if (this.isRunning) {
            this.ws = null;
          }
        };

        // Wait for connection by using a promise
        await new Promise<void>((resolve, reject) => {
          if (!this.ws) {
            reject(new Error("WebSocket not initialized"));
            return;
          }
          this.ws.onopen = () => {
            // Send subscribe message
            const subscribeMsg = {
              type: "subscribe",
              sessionId: this.filter.sessionId,
              traceId: this.filter.traceId,
            };
            this.ws?.send(JSON.stringify(subscribeMsg));
            resolve();
          };
          this.ws.onerror = () => {
            reject(new Error("WebSocket error"));
          };
        });

        this.reconnectAttempts = 0;

        // Yield messages as they arrive
        while (this.isRunning && this.ws) {
          // Yield from queue first
          if (this.messageQueue.length > 0) {
            yield this.messageQueue.shift()!;
            continue;
          }

          // Wait for next message
          const span = await new Promise<SpanData>((resolve) => {
            this.resolveNext = resolve;
            // Check queue again after a tick
            setTimeout(() => {
              if (this.resolveNext === resolve && this.messageQueue.length > 0) {
                this.resolveNext = null;
                resolve(this.messageQueue.shift()!);
              }
            }, 10);
          });
          if (span) {
            yield span;
          }
        }
      } catch (err) {
        if (!this.isRunning) break;

        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.isRunning = false;
          throw err;
        }

        // Exponential backoff with cap
        const delay = Math.min(
          this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1),
          this.reconnectMaxDelayMs,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  disconnect(): void {
    this.isRunning = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
