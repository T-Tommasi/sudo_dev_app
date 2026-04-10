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
    .replace(new RegExp(`${esc}\\[[0-9;]*[a-zA-Z]`, "g"), "")
    .replace(new RegExp(String.fromCharCode(0x9B) + `[0-9;]*[a-zA-Z]`, "g"), "");
}

// Format timestamp from ISO to HH:MM:SS
function formatTime(iso: string): string {
  return iso.slice(11, 19);
}

// Get status display from span status code
function getStatusDisplay(code: number): { text: string; color: string } {
  switch (code) {
    case 1:
      return { text: "OK", color: "green" };
    case 2:
      return { text: "ERROR", color: "red" };
    default:
      return { text: "PENDING", color: "yellow" };
  }
}

// Get 2-char tool abbreviation
function getToolAbbr(toolName: string): string {
  return toolName.slice(0, 2);
}

export function StreamPanel({ store }: Props) {
  const [spans, setSpans] = useState<SpanData[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  // Track scroll position for manual navigation
  // 0 = at bottom (auto-scroll), positive = scrolled up N lines from bottom
  const [scrollOffset, setScrollOffset] = useState(0);

  // Poll store for spans every 500ms
  useEffect(() => {
    const id = setInterval(() => {
      const state = store.getState();
      const activeSessionId = state.activeSessionId;

      let newSpans: SpanData[];
      if (activeSessionId) {
        newSpans = store.getSpansForSession(activeSessionId);
      } else {
        newSpans = state.spans.getAll();
      }

      // Apply filters if any active
      let filteredSpans = newSpans;
      if (state.activeFilters.length > 0) {
        filteredSpans = newSpans.filter((span) => {
          const toolName = (span.attributes["tool.name"] as string | undefined) ?? "";
          const name = span.name;
          return state.activeFilters.some(
            (filter) => name.includes(filter) || toolName.includes(filter)
          );
        });
      }

      // Keep last 100 for display
      const displaySpans = filteredSpans.slice(-100);

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
        <Text bold color="cyan"> Spans </Text>
        <Text dimColor>─</Text>
        {autoScroll && <Text dimColor> ─auto</Text>}
      </Box>

      <Box flexDirection="column" overflow="hidden">
        {visibleSpans.length === 0 ? (
          <Text dimColor> Waiting for spans...</Text>
        ) : (
          visibleSpans.map((span: SpanData) => {
            const time = formatTime(span.startTime);
            const rawToolName = (span.attributes["tool.name"] as string | undefined) ?? "";
            const toolName = sanitizeForTerminal(rawToolName);
            const tool = getToolAbbr(toolName);
            const name = sanitizeForTerminal(span.name);
            const start = new Date(span.startTime).getTime();
            const end = new Date(span.endTime).getTime();
            const duration = end - start;
            const spanStatus = getStatusDisplay(span.status.code);

            return (
              <Box key={span.spanId} flexDirection="row">
                <Text dimColor>[{time}]</Text>
                <Text> </Text>
                <Text>{name}</Text>
                <Text> </Text>
                <Text color="cyan">{tool}</Text>
                <Text> </Text>
                <Text>{duration}ms</Text>
                <Text> </Text>
                <Text color={spanStatus.color}>{spanStatus.text}</Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}