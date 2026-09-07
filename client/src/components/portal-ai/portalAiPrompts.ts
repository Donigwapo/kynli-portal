export type PortalAiPromptGroup = {
  key: "overview" | "financials" | "coaching" | "documents" | "generic";
  prompts: string[];
};

const PROMPT_MAP: Record<PortalAiPromptGroup["key"], string[]> = {
  overview: [
    "Summarize my business",
    "What needs attention?",
    "How are we doing this year?",
  ],
  financials: [
    "Explain this month",
    "Compare with last month",
    "Where are expenses increasing?",
    "What should I pay attention to?",
  ],
  coaching: [
    "Which triggers are most urgent?",
    "Explain these triggers",
    "What should I focus on first?",
    "Summarize this month's trigger monitor",
  ],
  documents: [
    "Summarize my documents",
    "What information can Kynli AI help me find?",
  ],
  generic: [
    "What can Kynli AI help me with?",
    "Explain what I'm looking at",
  ],
};

export function getPortalAiPromptGroup(pathname: string): PortalAiPromptGroup {
  const path = String(pathname || "").toLowerCase();

  if (path === "/portal" || path === "/portal/") {
    return { key: "overview", prompts: PROMPT_MAP.overview };
  }

  if (path.startsWith("/portal/financials")) {
    return { key: "financials", prompts: PROMPT_MAP.financials };
  }

  if (path.startsWith("/portal/coaching")) {
    return { key: "coaching", prompts: PROMPT_MAP.coaching };
  }

  if (path.startsWith("/portal/documents")) {
    return { key: "documents", prompts: PROMPT_MAP.documents };
  }

  return { key: "generic", prompts: PROMPT_MAP.generic };
}
