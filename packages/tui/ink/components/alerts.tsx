import { Box, Text, useInput } from "ink";
import React, { useEffect, useState } from "react";
import { TuiStore, Alert, AlertRule } from "../state/store.ts";

function sanitizeForTerminal(str: string): string {
  // deno-lint-ignore no-control-regex
  return str.replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    // deno-lint-ignore no-control-regex
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x9b[0-9;]*[a-zA-Z]/g, "");
}

interface Props {
  store: TuiStore;
}

function formatTimestamp(iso: string): string {
  return iso.slice(11, 19);
}

function formatRule(rule: AlertRule, _triggeredCount: number): string {
  return `${sanitizeForTerminal(rule.field)} ${sanitizeForTerminal(rule.operator)} ${sanitizeForTerminal(String(rule.value))}`;
}

export function Alerts({ store }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [selectedAlertIndex, setSelectedAlertIndex] = useState(0);
  const [selectedRuleIndex, setSelectedRuleIndex] = useState(0);
  const [flash, setFlash] = useState(false);

  // Poll store every 1 second
  useEffect(() => {
    const id = setInterval(() => {
      setAlerts(store.getActiveAlerts().slice(-20));
      setRules(store.getState().alertRules);
    }, 1000);
    return () => clearInterval(id);
  }, [store]);

  // Flash animation at 500ms
  useEffect(() => {
    const id = setInterval(() => {
      setFlash((f: boolean) => !f);
    }, 500);
    return () => clearInterval(id);
  }, []);

  useInput((input: string, key: { upArrow?: boolean; downArrow?: boolean; leftArrow?: boolean; rightArrow?: boolean }) => {
    if (input === "a" || input === "A") {
      const unacknowledged = store.getActiveAlerts();
      if (unacknowledged.length > 0) {
        const idx = selectedAlertIndex % unacknowledged.length;
        store.acknowledgeAlert(unacknowledged[idx].id);
      }
    } else if (input === "t" || input === "T") {
      const state = store.getState();
      if (state.alertRules.length > 0) {
        const idx = selectedRuleIndex % state.alertRules.length;
        const rule = state.alertRules[idx];
        store.toggleAlertRule(rule.id);
      }
    } else if (key.upArrow) {
      setSelectedAlertIndex((i: number) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedAlertIndex((i: number) =>
        Math.min(alerts.length - 1, i + 1)
      );
    } else if (key.leftArrow) {
      setSelectedRuleIndex((i: number) => Math.max(0, i - 1));
    } else if (key.rightArrow) {
      const state = store.getState();
      setSelectedRuleIndex((i: number) =>
        Math.min(state.alertRules.length - 1, i + 1)
      );
    }
  });

  const triggeredCounts: Record<string, number> = {};
  for (const alert of store.getState().triggeredAlerts) {
    triggeredCounts[alert.ruleId] = (triggeredCounts[alert.ruleId] ?? 0) + 1;
  }

  return (
    <Box flexDirection="column" borderStyle="round" title="Alerts" padding={1}>
      <Box flexDirection="column" gap={0}>
        {alerts.length === 0 ? (
          <Text color="green">No active alerts ✓</Text>
        ) : (
          alerts.map((alert: Alert, i: number) => {
            const isSelected = i === selectedAlertIndex;
            const dim = alert.acknowledged;
            const flashColor = flash ? "red" : "dim";
            const color = dim ? "dim" : (isSelected ? undefined : flashColor);
            return (
              <Box key={alert.id}>
                <Text color={color} bold={isSelected} inverse={isSelected}>
                  {`[${formatTimestamp(alert.timestamp)}] `}
                </Text>
                <Text color={color} bold={isSelected} inverse={isSelected}>
                  {`Alert: ${formatRule(
                    rules.find((r: AlertRule) => r.id === alert.ruleId) ?? {
                      id: alert.ruleId,
                      field: "?",
                      operator: "eq" as const,
                      value: "?",
                      enabled: false,
                    },
                    triggeredCounts[alert.ruleId] ?? 0
                  )}`}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      <Box marginTop={1} flexDirection="column" gap={0}>
        <Text bold>Rules:</Text>
        {rules.length === 0 ? (
          <Text color="grey">No alert rules configured</Text>
        ) : (
          rules.map((rule: AlertRule, i: number) => {
            const isSelected = i === selectedRuleIndex;
            const triggeredCount = triggeredCounts[rule.id] ?? 0;
            return (
              <Box key={rule.id}>
                <Text
                  bold={isSelected}
                  inverse={isSelected}
                  color={isSelected ? undefined : rule.enabled ? "green" : "dim"}
                >
                  {`[${i + 1}] ${formatRule(rule, triggeredCount)} `}
                </Text>
                <Text
                  bold={isSelected}
                  inverse={isSelected}
                  color={isSelected ? undefined : rule.enabled ? "green" : "dim"}
                >
                  {rule.enabled ? "◉" : "✗"}
                </Text>
                <Text
                  bold={isSelected}
                  inverse={isSelected}
                  color={isSelected ? undefined : rule.enabled ? "green" : "dim"}
                >
                  {` (triggered ${triggeredCount}x)`}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      <Box marginTop={1}>
        <Text color="grey">
          {"[A]Ack [T]Toggle"}
        </Text>
      </Box>
    </Box>
  );
}
