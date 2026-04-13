import { Box, Text, useInput } from "ink";
import React, { useEffect, useState } from "react";
import { TuiStore } from "./state/store.ts";
import { WebSocketClient } from "../ws/client.ts";
import { Header } from "./components/header.tsx";
import { Sidebar } from "./components/sidebar.tsx";
import { StreamPanel } from "./components/stream.tsx";
import { TracesPanel } from "./components/traces.tsx";
import { Metrics } from "./components/metrics.tsx";
import { Alerts } from "./components/alerts.tsx";
import { FilterBar } from "./components/filter.tsx";

type TabId = "stream" | "traces" | "agent" | "metrics" | "alerts";

const TABS: { id: TabId; label: string }[] = [
  { id: "stream", label: "STREAM" },
  { id: "traces", label: "TRACES" },
  { id: "agent", label: "AGENT" },
  { id: "metrics", label: "METRICS" },
  { id: "alerts", label: "ALERTS" },
];

export function App() {
  const [store] = useState(() => new TuiStore());
  const [activeTab, setActiveTab] = useState<TabId>("stream");
  const [metricsExpanded, setMetricsExpanded] = useState(false);

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

  useInput((input: string, key: { ctrl?: boolean }) => {
    if (key.ctrl && (input === "m" || input === "M")) {
      setMetricsExpanded(!metricsExpanded);
    } else if (input === "1") {
      setActiveTab("stream");
    } else if (input === "2") {
      setActiveTab("traces");
    } else if (input === "3") {
      setActiveTab("agent");
    } else if (input === "4") {
      setActiveTab("metrics");
    } else if (input === "5") {
      setActiveTab("alerts");
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Header store={store} />

      <Box flexDirection="row" flexGrow={1}>
        <Sidebar store={store} />

        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderDim>
          <FilterBar store={store} />

          <Box flexDirection="row" paddingX={2} paddingTop={1}>
            {TABS.map((tab) => (
              <Box
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <Text
                  bold={activeTab === tab.id}
                  color={activeTab === tab.id ? "cyan" : "white"}
                >
                  {activeTab === tab.id ? "[ " : "  "}
                  {tab.label}
                  {activeTab === tab.id ? " ]" : "  "}
                </Text>
              </Box>
            ))}
          </Box>

          <Box flexDirection="column" flexGrow={1} padding={1}>
            {activeTab === "stream" && <StreamPanel store={store} />}
            {activeTab === "traces" && <TracesPanel store={store} />}
            {activeTab === "agent" && (
              <Box justifyContent="center" alignItems="center">
                <Text dimColor>Coming in Phase 4</Text>
              </Box>
            )}
            {activeTab === "metrics" && <Metrics store={store} />}
            {activeTab === "alerts" && <Alerts store={store} />}
          </Box>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text dimColor>
          {metricsExpanded ? "▼" : "▶"} Metrics+Alerts (Ctrl+M to toggle)
        </Text>
        {metricsExpanded && (
          <Box flexDirection="column" paddingTop={1}>
            <Metrics store={store} />
            <Alerts store={store} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
