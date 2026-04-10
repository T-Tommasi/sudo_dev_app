import { Box, Text } from "ink";
import React, { useEffect, useState } from "react";
import { TuiStore, ConnectionState } from "../state/store.ts";

function sanitizeForTerminal(str: string): string {
  // Remove C0/C1 control chars and 8-bit control chars
  const filtered: string[] = [];
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if ((code >= 0x20 && code < 0x7F) || code >= 0xA0) {
      filtered.push(ch);
    }
  }
  // Remove ANSI escape sequences (ESC[... seq)
  const esc = "\x1B";
  return filtered.join("").replace(new RegExp(esc + "\\[[0-9;]*[a-zA-Z]", "g"), "");
}

interface Props {
  store: TuiStore;
}

export function Header({ store }: Props) {
  const [time, setTime] = useState(() => new Date().toISOString().slice(11, 19));
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const state = store.getState();
      setTime(new Date().toISOString().slice(11, 19));
      setConnectionState(state.connectionState);
      setSessionId(state.activeSessionId);
    }, 1000);
    return () => clearInterval(id);
  }, [store]);

  const connected = connectionState === "connected";

  const sanitizedSessionId = sessionId !== null ? sanitizeForTerminal(sessionId) : "—";

  return (
    <Box>
      <Text bold color="cyan">opencode-glass</Text>
      <Text> │ session: {sanitizedSessionId} │ </Text>
      <Text color={connected ? "green" : "red"}>
        {connected ? "●" : "○"} {connectionState}
      </Text>
      <Text> │ {time} UTC</Text>
    </Box>
  );
}
