import { Box, Text, Spacer, useInput } from "ink";
import React, { useState } from "react";
import { TuiStore } from "../state/store.ts";

interface LastMessage {
  question: string;
  response: string;
}

interface Props {
  store: TuiStore;
  activeSessionId: string | null;
  connected: boolean;
}

export function Chat({ store: _store, activeSessionId, connected }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [lastMessage, setLastMessage] = useState<LastMessage | null>(null);

  useInput((input: string, key: { return?: boolean; escape?: boolean }) => {
    if (key.return) {
      handleSend();
    } else if (key.escape) {
      setInputValue("");
    } else if (input) {
      setInputValue((prev: string) => prev + input);
    }
  });

  async function handleSend() {
    if (!inputValue.trim() || !activeSessionId || sending) return;
    setSending(true);
    try {
      const res = await fetch(
        `http://localhost:8080/sessions/${activeSessionId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content: inputValue }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLastMessage({ question: inputValue, response: data.content ?? "" });
      setInputValue("");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setLastMessage({ question: inputValue, response: `Error: ${errorMsg}` });
    } finally {
      setSending(false);
    }
  }

  const noSession = !activeSessionId;
  const disconnected = !connected;

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box>
        <Text bold color="cyan">Chat</Text>
        <Text> </Text>
        <Text dimColor>{activeSessionId ?? "—"}</Text>
        <Text> &gt; </Text>
        <Text>{inputValue || " "}</Text>
        {sending && <Text dimColor> Sending...</Text>}
      </Box>

      <Box>
        <Text dimColor>[History] </Text>
        {lastMessage ? (
          <Text dimColor>
            Last: &quot;{lastMessage.question}&quot; → &quot;{lastMessage.response}&quot;
          </Text>
        ) : noSession ? (
          <Text dimColor>No session selected — select a session from the sidebar to chat</Text>
        ) : (
          <Text dimColor>No messages yet</Text>
        )}
      </Box>

      <Box>
        <Text dimColor>[Enter]Send [Esc]Cancel</Text>
        <Spacer />
        <Text color={disconnected ? "red" : "green"}>
          {disconnected ? "Offline — cannot send messages" : "Connected"}
        </Text>
      </Box>
    </Box>
  );
}
