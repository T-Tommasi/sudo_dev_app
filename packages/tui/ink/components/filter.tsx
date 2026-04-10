import { Box, Text, useInput } from "ink";
import React, { useState, useEffect } from "react";
import { TuiStore } from "../state/store.ts";

type QuickFilter = "all" | "errors" | "tools" | "llm";

interface Props {
  store: TuiStore;
}

function applyQuickFilter(store: TuiStore, filter: QuickFilter): void {
  // Remove existing quick filters first
  const state = store.getState();
  const quickFilterTags = ["status.code=2", "has:tool.name", "agent.type=llm"];
  quickFilterTags.forEach((tag) => {
    if (state.activeFilters.includes(tag)) {
      store.removeFilter(tag);
    }
  });

  switch (filter) {
    case "errors":
      store.addFilter("status.code=2");
      break;
    case "tools":
      store.addFilter("has:tool.name");
      break;
    case "llm":
      store.addFilter("agent.type=llm");
      break;
    case "all":
    default:
      // All quick filters removed
      break;
  }
}

function getActiveQuickFilter(activeFilters: string[]): QuickFilter {
  if (activeFilters.includes("status.code=2")) return "errors";
  if (activeFilters.includes("has:tool.name")) return "tools";
  if (activeFilters.includes("agent.type=llm")) return "llm";
  return "all";
}

function FilterChip({
  filter,
  isSelected,
  onSelect,
}: {
  filter: string;
  isSelected: boolean;
  onSelect: () => void;
  key?: string;
}) {
  return (
    <Box
      onClick={onSelect}
      borderStyle="single"
      borderColor={isSelected ? "cyan" : "white"}
      paddingX={1}
      marginRight={1}
    >
      <Text backgroundColor={isSelected ? "cyan" : undefined} color={isSelected ? "black" : "white"}>
        ×{filter}
      </Text>
    </Box>
  );
}

function QuickFilterButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      borderStyle="single"
      borderColor="white"
      paddingX={1}
      marginLeft={1}
    >
      <Text bold={isActive} color={isActive ? "cyan" : "white"}>
        [{label}]
      </Text>
    </Box>
  );
}

function AddFilterInput({
  onSubmit,
  onCancel,
}: {
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");

  useInput((input: string, key: { return?: boolean; escape?: boolean; delete?: boolean; backspace?: boolean }) => {
    if (key.return) {
      if (value.trim()) {
        onSubmit(value.trim());
      }
      onCancel();
    } else if (key.escape) {
      onCancel();
    } else if (key.delete || key.backspace) {
      setValue((v: string) => v.slice(0, -1));
    } else if (input && input >= " " && input <= "~") {
      setValue((v: string) => v + input);
    }
  });

  return (
    <Box marginTop={1} paddingLeft={2}>
      <Text color="cyan">Filter:</Text>
      <Text color="white"> {value}</Text>
      <Text dimColor> (Enter to add, Escape to cancel)</Text>
    </Box>
  );
}

export function FilterBar({ store }: Props) {
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isAddingFilter, setIsAddingFilter] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  useEffect(() => {
    const interval = setInterval(() => {
      const state = store.getState();
      setActiveFilters([...state.activeFilters]);
      setQuickFilter(getActiveQuickFilter(state.activeFilters));
    }, 100);
    return () => clearInterval(interval);
  }, [store]);

  useInput((input: string, key: { leftArrow?: boolean; rightArrow?: boolean; delete?: boolean; backspace?: boolean }) => {
    if (isAddingFilter) return;

    if (key.leftArrow) {
      setSelectedIndex((i: number | null) => {
        if (i === null) return activeFilters.length > 0 ? activeFilters.length - 1 : null;
        return Math.max(0, i - 1);
      });
    } else if (key.rightArrow) {
      setSelectedIndex((i: number | null) => {
        if (i === null) return 0;
        return Math.min(activeFilters.length - 1, i + 1);
      });
    } else if ((key.delete || key.backspace) && selectedIndex !== null && selectedIndex < activeFilters.length) {
      store.removeFilter(activeFilters[selectedIndex]);
      setSelectedIndex((i: number | null) => {
        if (i !== null && i > 0) return i - 1;
        return null;
      });
    } else if (input === "+" || input === "a") {
      setIsAddingFilter(true);
    }
  });

  const handleAddFilter = (value: string) => {
    store.addFilter(value);
    setIsAddingFilter(false);
  };

  const handleCancelAdd = () => {
    setIsAddingFilter(false);
  };

  const handleSelectFilter = (index: number) => {
    setSelectedIndex(index);
  };

  const handleQuickFilter = (filter: QuickFilter) => {
    applyQuickFilter(store, filter);
  };

  return (
    <Box flexDirection="column">
      <Box alignItems="center">
        <Text bold color="cyan">Filters:</Text>
        <Box marginLeft={1} flexGrow={1}>
          {activeFilters.map((filter: string, index: number) => (
            <FilterChip
              key={filter}
              filter={filter}
              isSelected={selectedIndex === index}
              onSelect={() => handleSelectFilter(index)}
            />
          ))}
          {!isAddingFilter && (
            <Box
              onClick={() => setIsAddingFilter(true)}
              borderStyle="single"
              borderColor="green"
              paddingX={1}
            >
              <Text color="green">+Add</Text>
            </Box>
          )}
        </Box>
        <Box marginLeft={1}>
          <Text dimColor>  </Text>
        </Box>
        <QuickFilterButton
          label="All"
          isActive={quickFilter === "all"}
          onClick={() => handleQuickFilter("all")}
        />
        <QuickFilterButton
          label="Errors"
          isActive={quickFilter === "errors"}
          onClick={() => handleQuickFilter("errors")}
        />
        <QuickFilterButton
          label="Tools"
          isActive={quickFilter === "tools"}
          onClick={() => handleQuickFilter("tools")}
        />
        <QuickFilterButton
          label="LLM"
          isActive={quickFilter === "llm"}
          onClick={() => handleQuickFilter("llm")}
        />
      </Box>
      {isAddingFilter && <AddFilterInput onSubmit={handleAddFilter} onCancel={handleCancelAdd} />}
    </Box>
  );
}
