import { Box, Text, useInput } from "ink";
import React, { useEffect, useState } from "react";
import type { SpanData } from "../../ws/client.ts";
import { TuiStore } from "../state/store.ts";

interface Props {
  store: TuiStore;
}

// Sanitize untrusted strings for terminal display
function sanitizeForTerminal(str: string): string {
  const c0 = String.fromCharCode(0x00);
  const c1f = String.fromCharCode(0x1F);
  const c7f = String.fromCharCode(0x7F);
  const c9f = String.fromCharCode(0x9F);
  const esc = String.fromCharCode(0x1B);

  return String(str)
    .replace(new RegExp(`[${c0}-${c1f}${c7f}-${c9f}]`, "g"), "")
    .replace(new RegExp(`${esc}\\[([0-9;]*)[a-zA-Z]`, "g"), "")
    .replace(new RegExp(String.fromCharCode(0x9B) + `[0-9;]*[a-zA-Z]`, "g"), "");
}

// Format timestamp from ISO to HH:MM:SS
function formatTime(iso: string): string {
  return iso.slice(11, 19);
}

// Check if a span is an agent_thinking span
function isAgentThinkingSpan(span: SpanData): boolean {
  return (
    (span.attributes["agent_thinking"] as boolean) === true ||
    span.name === "agent_thinking" ||
    (span.attributes["action.type"] as string) === "agent_thinking"
  );
}

export function AgentActivityPanel({ store }: Props) {
  const [spans, setSpans] = useState<SpanData[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Poll store for agent_thinking spans every 500ms
  useEffect(() => {
    const id = setInterval(() => {
      const state = store.getState();
      const activeSessionId = state.activeSessionId;

      let allSpans: SpanData[];
      if (activeSessionId) {
        allSpans = store.getSpansForSession(activeSessionId);
      } else {
        allSpans = state.spans.getAll();
      }

      // Filter to only agent_thinking spans
      const thinkingSpans = allSpans.filter(isAgentThinkingSpan);

      // Keep last 100 for display
      const displaySpans = thinkingSpans.slice(-100);

      setSpans(displaySpans);

      // Reset scroll offset when new spans arrive if auto-scrolling
      if (autoScroll) {
        setScrollOffset(0);
      }
    }, 500);

    return () => clearInterval(id);
  }, [store, autoScroll]);

  // Handle keyboard navigation
  useInput((_input: string, key: { upArrow?: boolean; downArrow?: boolean; pageUp?: boolean; pageDown?: boolean; delete?: boolean }) => {
    if (key.upArrow) {
      setScrollOffset((o: number) => Math.min(o + 1, spans.length - 1));
      setAutoScroll(false);
    } else if (key.downArrow) {
      if (scrollOffset > 0) {
        setScrollOffset((o: number) => o - 1);
      } else {
        setAutoScroll(true);
      }
    } else if (key.pageUp) {
      setScrollOffset((o: number) => Math.min(o + 10, spans.length - 1));
      setAutoScroll(false);
    } else if (key.pageDown) {
      setScrollOffset((o: number) => Math.max(o - 10, 0));
      if (scrollOffset <= 10) {
        setAutoScroll(true);
      }
    } else if (key.delete) {
      setAutoScroll((a: boolean) => !a);
    }
  });

  // Determine which spans to show based on scroll offset
  const visibleSpans = scrollOffset > 0
    ? spans.slice(-100, -scrollOffset)
    : spans.slice(-100);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Box flexDirection="row">
        <Text bold color="cyan"> Agent </Text>
        <Text dimColor>─</Text>
        {autoScroll && <Text dimColor> ─auto</Text>}
      </Box>

      <Box flexDirection="column" overflow="hidden">
        {visibleSpans.length === 0 ? (
          <Text dimColor> No agent activity yet</Text>
        ) : (
          visibleSpans.map((span: SpanData) => {
            const time = formatTime(span.startTime);

            // Extract agent_thinking attributes
            const thinking = span.attributes["agent_thinking"] as Record<string, unknown> | undefined;
            const phase = sanitizeForTerminal(
              (thinking?.phase as string) ??
              (span.attributes["agent_thinking.phase"] as string) ??
              (span.attributes["agent.phase"] as string) ??
              ""
            );
            const agent = sanitizeForTerminal(
              (thinking?.agent as string) ??
              (span.attributes["agent_thinking.agent"] as string) ??
              (span.attributes["agent.name"] as string) ??
              ""
            );
            const thought = sanitizeForTerminal(
              (thinking?.thought as string) ??
              (span.attributes["agent_thinking.thought"] as string) ??
              (span.attributes["agent.thought"] as string) ??
              (span.attributes["agent.message"] as string) ??
              ""
            );

            return (
              <Box key={span.spanId} flexDirection="row">
                <Text dimColor>[{time}]</Text>
                <Text> </Text>
                <Text color="cyan">{phase}</Text>
                <Text> </Text>
                <Text color="green">{agent}</Text>
                <Text> </Text>
                <Text>—</Text>
                <Text> </Text>
                <Text>{thought}</Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
