import { Box, Text } from "ink";
import React, { useEffect, useState } from "react";
import type { TuiStore } from "../state/store.ts";

interface Props {
  store: TuiStore;
}

const LATENCY_LABELS = ["<10ms", "<50ms", "<100ms", "<500ms", ">=500ms"];
const BAR_WIDTH = 30;

function renderBar(count: number, max: number, width = BAR_WIDTH): string {
  if (max === 0) return " ".repeat(width);
  const filled = Math.round((count / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function renderLatencyHistogram(buckets: number[]): React.ReactNode {
  const max = Math.max(...buckets, 1);
  return (
    <Box flexDirection="column">
      {buckets.map((count, i) => (
        <Box key={i}>
          <Text>{LATENCY_LABELS[i].padEnd(7)} </Text>
          <Text>{renderBar(count, max)}</Text>
          <Text> {count.toLocaleString()}</Text>
        </Box>
      ))}
    </Box>
  );
}

function renderToolCounts(toolCounts: Record<string, number>, max: number): React.ReactNode {
  return (
    <Box flexDirection="column">
      {Object.entries(toolCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => (
          <Box key={name}>
            <Text>{name.padEnd(25)} </Text>
            <Text>{renderBar(count, max)}</Text>
            <Text> {count.toLocaleString()}</Text>
          </Box>
        ))}
    </Box>
  );
}

export function Metrics({ store }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [metrics, setMetrics] = useState(() => store.getState().metrics);

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics({ ...store.getState().metrics });
    }, 2000);
    return () => clearInterval(id);
  }, [store]);

  const hasData = metrics.totalSpans > 0;

  if (!hasData) {
    return (
      <Box>
        <Text dimColor>No metrics yet</Text>
      </Box>
    );
  }

  const toolEntries: [string, number][] = Object.entries(metrics.toolCounts);
  const topToolCount = toolEntries.length > 0
    ? Math.max(...toolEntries.map(([, c]) => c), 1)
    : 1;

  const headerRow = (
    <Box>
      <Box onClick={() => setExpanded(!expanded)}>
        <Text bold color="cyan" dimColor={expanded}>
          {expanded ? "▼" : "▶"} Metrics
        </Text>
      </Box>
      <Text>  │ Total: {metrics.totalSpans.toLocaleString()} </Text>
      <Text color="green">✓ {metrics.successCount.toLocaleString()}</Text>
      <Text>  </Text>
      <Text color="red">✗ {metrics.errorCount.toLocaleString()}</Text>
    </Box>
  );

  if (!expanded) {
    return <Box>{headerRow}</Box>;
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderDim={!expanded}>
      <Box padding={0}>
        {headerRow}
      </Box>
      <Box flexDirection="column" paddingLeft={2}>
        <Box>
          <Text bold>Latency buckets:</Text>
        </Box>
        <Box paddingLeft={2}>
          {renderLatencyHistogram(metrics.latencyBuckets)}
        </Box>
        <Box>
          <Text bold>Tool counts:</Text>
        </Box>
        <Box paddingLeft={2}>
          {renderToolCounts(metrics.toolCounts, topToolCount)}
        </Box>
      </Box>
    </Box>
  );
}