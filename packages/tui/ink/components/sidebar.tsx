import { Box, Text, useInput } from "ink";
import React, { useEffect, useState, useCallback } from "react";
import { z } from "zod";
import { TuiStore, SessionInfo } from "../state/store.ts";

const SessionSchema = z.object({
  id: z.string(),
  goal: z.string(),
  status: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

function sanitizeForTerminal(str: string): string {
  const filtered: string[] = [];
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if ((code >= 0x20 && code < 0x7F) || code >= 0xA0) {
      filtered.push(ch);
    }
  }
  const esc = "\x1B";
  return filtered.join("").replace(new RegExp(esc + "\\[[0-9;]*[a-zA-Z]", "g"), "");
}

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "pending":
      return "yellow";
    case "active":
      return "green";
    case "completed":
      return "blue";
    case "failed":
      return "red";
    default:
      return "white";
  }
}

interface Props {
  store: TuiStore;
}

interface SessionWithCount extends SessionInfo {
  spanCount: number;
}

export function Sidebar({ store }: Props) {
  const [sessions, setSessions] = useState<SessionWithCount[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const state = store.getState();
      setActiveSessionId(state.activeSessionId);
    }, 500);
    return () => clearInterval(id);
  }, [store]);

  useEffect(() => {
    async function fetchSessions() {
      let sessions: SessionInfo[] = [];
      try {
        const res = await fetch("http://localhost:8080/sessions");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw: unknown[] = await res.json();
        const parsed = z.array(SessionSchema).safeParse(raw);
        if (!parsed.success) {
          console.error("Invalid session data:", parsed.error);
          sessions = [];
        } else {
          sessions = parsed.data.map((s) => ({
            id: s.id,
            goal: s.goal,
            status: s.status,
            createdAt: s.created_at ?? s.createdAt ?? "",
            updatedAt: s.updated_at ?? s.updatedAt ?? "",
          }));
        }
      } catch {
        sessions = [];
      }
      const spans = store.getState().spans.getAll();
      const sessionsWithCount: SessionWithCount[] = sessions.map((s: SessionInfo) => ({
        ...s,
        spanCount: spans.filter(
          (sp) => sp.attributes["session.id"] === s.id
        ).length,
      }));
      setSessions(sessionsWithCount);
      store.setSessions(sessions);
    }
    fetchSessions();
  }, [store]);

  useInput(
    useCallback(
      (
        _input: string,
        key: { upArrow: boolean; downArrow: boolean; return: boolean }
      ) => {
        if (key.upArrow) {
          setSelectedIndex((prev: number) => Math.max(0, prev - 1));
        } else if (key.downArrow) {
          setSelectedIndex((prev: number) => Math.min(sessions.length - 1, prev + 1));
        } else if (key.return && sessions.length > 0) {
          const selected = sessions[selectedIndex];
          if (selected) {
            store.setActiveSession(selected.id);
          }
        }
      },
      [sessions, selectedIndex, store]
    )
  );

  const sanitizedSessions = sessions.map((s: SessionWithCount) => ({
    ...s,
    id: sanitizeForTerminal(s.id),
    goal: sanitizeForTerminal(s.goal).slice(0, 30),
  }));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="white" padding={1}>
      <Box justifyContent="space-between">
        <Box onClick={() => setCollapsed(!collapsed)}>
          <Text bold color="white">
            {collapsed ? "►" : "▼"} Sessions ({sessions.length})
          </Text>
        </Box>
      </Box>

      {!collapsed && (
        <Box flexDirection="column" marginTop={1}>
          {sanitizedSessions.length === 0 ? (
            <Text color="gray">No sessions</Text>
          ) : (
            sanitizedSessions.map((session: SessionWithCount, idx: number) => {
              const isSelected = idx === selectedIndex;
              const isActive = sanitizeForTerminal(session.id) === sanitizeForTerminal(activeSessionId ?? "");

              return (
                <Box key={session.id} paddingX={1}>
                  <Text
                    bold={isSelected}
                    color={isSelected ? "cyan" : isActive ? "cyanBright" : undefined}
                  >
                    {isSelected ? "► " : "  "}
                    {session.id.slice(0, 8).padEnd(8)}
                  </Text>
                  <Text color="gray"> </Text>
                  <Text
                    color={getStatusColor(session.status)}
                    dimColor={!isSelected}
                  >
                    {session.status.slice(0, 10).padEnd(10)}
                  </Text>
                  <Text color="gray"> </Text>
                  <Text dimColor={!isSelected}>{session.goal}</Text>
                  <Text color="gray"> </Text>
                  <Text dimColor color="gray">
                    ({session.spanCount})
                  </Text>
                </Box>
              );
            })
          )}
        </Box>
      )}
    </Box>
  );
}
