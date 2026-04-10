import { Box, Text } from "ink";
import React, { useEffect, useState } from "react";
import { TuiStore } from "./state/store.ts";
import { WebSocketClient } from "../ws/client.ts";
import { Header } from "./components/header.tsx";

export function App() {
  const [store] = useState(() => new TuiStore());

  useEffect(() => {
    const ws = new WebSocketClient();
    let closed = false;

    (async () => {
      store.setConnectionState("connecting");
      try {
        for await (const span of ws.connect(
          store.getState().activeSessionId
            ? { sessionId: store.getState().activeSessionId }
            : {}
        )) {
          if (closed) break;
          store.addSpan(span);
        }
      } catch (err) {
        console.error("WebSocket error:", err);
      } finally {
        if (!closed) {
          store.setConnectionState("disconnected");
        }
      }
    })();

    return () => {
      closed = true;
      ws.disconnect();
      store.setConnectionState("disconnected");
    };
  }, []);

  return (
    <Box flexDirection="column">
      <Header store={store} />
      <Box flexDirection="column" padding={1}>
        <Text>Phase 1 — panels coming in Phase 2</Text>
      </Box>
    </Box>
  );
}
