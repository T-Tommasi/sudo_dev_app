import { Box, Text, useInput } from "ink";
import React, { useEffect, useState, useRef } from "react";
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

// Get span kind display string
function getKindDisplay(kind: number): string {
  switch (kind) {
    case 1:
      return "client";
    case 2:
      return "server";
    case 3:
      return "producer";
    case 4:
      return "consumer";
    default:
      return "internal";
  }
}

// Truncate spanId to 8 characters
function truncateSpanId(id: string): string {
  return id.slice(0, 8);
}

export function TracesPanel({ store }: Props) {
  const [spans, setSpans] = useState<SpanData[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedSpanId, setExpandedSpanId] = useState<string | null>(null);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

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

      // Adjust selectedIndex if needed
      if (displaySpans.length > 0 && selectedIndexRef.current >= displaySpans.length) {
        setSelectedIndex(displaySpans.length - 1);
      }
    }, 500);

    return () => clearInterval(id);
  }, [store]);

  // Handle keyboard navigation
  useInput((_input: string, key: { upArrow?: boolean; downArrow?: boolean; pageUp?: boolean; pageDown?: boolean; return?: boolean; escape?: boolean }) => {
    if (expandedSpanId) {
      // In detail view, Escape collapses
      if (key.escape) {
        setExpandedSpanId(null);
      }
      return;
    }

    // In list view
    if (key.upArrow) {
      setSelectedIndex((i: number) => Math.max(i - 1, 0));
    } else if (key.downArrow) {
      setSelectedIndex((i: number) => Math.min(i + 1, spans.length - 1));
    } else if (key.pageUp) {
      setSelectedIndex((i: number) => Math.max(i - 10, 0));
    } else if (key.pageDown) {
      setSelectedIndex((i: number) => Math.min(i + 10, spans.length - 1));
    } else if (key.return) {
      // Enter expands the selected span
      if (spans[selectedIndex]) {
        setExpandedSpanId(spans[selectedIndex].spanId);
      }
    }
  });

  // Determine visible spans
  const visibleSpans = spans.length > 0 ? spans : [];

  // Get the expanded span data
  const expandedSpan = expandedSpanId
    ? visibleSpans.find((s: SpanData) => s.spanId === expandedSpanId)
    : null;

  // Render detail view
  if (expandedSpan) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
        <Box flexDirection="row">
          <Text bold color="cyan"> Traces </Text>
          <Text dimColor>─</Text>
          <Text dimColor> (ESC to collapse)</Text>
        </Box>

        <Box flexDirection="column" paddingTop={1}>
          {/* Full span info */}
          <Box flexDirection="row">
            <Text dimColor>traceId: </Text>
            <Text>{sanitizeForTerminal(expandedSpan.traceId)}</Text>
          </Box>
          <Box flexDirection="row">
            <Text dimColor>spanId: </Text>
            <Text>{sanitizeForTerminal(expandedSpan.spanId)}</Text>
          </Box>
          <Box flexDirection="row">
            <Text dimColor>parentId: </Text>
            <Text>{expandedSpan.parentSpanId ? sanitizeForTerminal(expandedSpan.parentSpanId) : "-"}</Text>
          </Box>
          <Box flexDirection="row">
            <Text dimColor>name: </Text>
            <Text>{sanitizeForTerminal(expandedSpan.name)}</Text>
          </Box>
          <Box flexDirection="row">
            <Text dimColor>kind: </Text>
            <Text>{getKindDisplay(expandedSpan.kind)}</Text>
          </Box>
          <Box flexDirection="row">
            <Text dimColor>startTime: </Text>
            <Text>{expandedSpan.startTime}</Text>
          </Box>
          <Box flexDirection="row">
            <Text dimColor>endTime: </Text>
            <Text>{expandedSpan.endTime}</Text>
          </Box>
          <Box flexDirection="row">
            <Text dimColor>duration: </Text>
            <Text>{new Date(expandedSpan.endTime).getTime() - new Date(expandedSpan.startTime).getTime()}ms</Text>
          </Box>
          <Box flexDirection="row">
            <Text dimColor>status: </Text>
            <Text color={getStatusDisplay(expandedSpan.status.code).color}>
              {getStatusDisplay(expandedSpan.status.code).text}
            </Text>
          </Box>

          {/* Status description if present */}
          {expandedSpan.status.description && (
            <Box flexDirection="row">
              <Text dimColor>statusDesc: </Text>
              <Text>{sanitizeForTerminal(expandedSpan.status.description)}</Text>
            </Box>
          )}

          {/* Attributes table */}
          <Box paddingTop={1}>
            <Text bold>Attributes</Text>
          </Box>
          {Object.keys(expandedSpan.attributes).length === 0 ? (
            <Text dimColor>(none)</Text>
          ) : (
            Object.entries(expandedSpan.attributes).map(([key, value]) => (
              <Box key={key} flexDirection="row">
                <Text dimColor>{key}: </Text>
                <Text>{sanitizeForTerminal(String(value))}</Text>
              </Box>
            ))
          )}
        </Box>
      </Box>
    );
  }

  // Render list view
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Box flexDirection="row">
        <Text bold color="cyan"> Traces </Text>
        <Text dimColor>─</Text>
        <Text dimColor> {visibleSpans.length} spans</Text>
        <Text dimColor> (↑↓ navigate, Enter expand, PgUp/Dn jump)</Text>
      </Box>

      <Box flexDirection="column" overflow="hidden">
        {visibleSpans.length === 0 ? (
          <Text dimColor> Waiting for spans...</Text>
        ) : (
          visibleSpans.map((span: SpanData, idx: number) => {
            const truncatedId = truncateSpanId(span.spanId);
            const name = sanitizeForTerminal(span.name);
            const time = formatTime(span.startTime);
            const start = new Date(span.startTime).getTime();
            const end = new Date(span.endTime).getTime();
            const duration = end - start;
            const spanStatus = getStatusDisplay(span.status.code);
            const isSelected = idx === selectedIndex;

            return (
              <Box key={span.spanId} flexDirection="row">
                {isSelected ? <Text bold color="cyan">▶ </Text> : <Text>  </Text>}
                <Text dimColor>[{truncatedId}]</Text>
                <Text> </Text>
                <Text bold={isSelected}>{name}</Text>
                <Text> </Text>
                <Text dimColor>{time}</Text>
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