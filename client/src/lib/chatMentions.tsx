import type { ReactNode } from "react";

export function buildMentionLabels(candidates: Array<{ displayName?: string | null }>): string[] {
  return Array.from(
    new Set(
      (candidates || [])
        .map((c) => `@${(c.displayName || "").trim()}`)
        .filter((v) => v.length > 1),
    ),
  ).sort((a, b) => b.length - a.length);
}

export function renderMessageWithMentions(text: string, mentionLabels: string[]): ReactNode[] {
  if (!text) return [text];

  const labels = mentionLabels
    .map((l) => l.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const isBoundaryBefore = (ch?: string) => !ch || /\s|[([{"'`]/.test(ch);
  const isBoundaryAfter = (ch?: string) => !ch || /\s|[.,!?;:)\]}"'`]/.test(ch);
  const fallbackMentionPattern = /^@[a-z0-9._-]+$/i;

  const nodes: ReactNode[] = [];
  let i = 0;
  let chunkStart = 0;
  let mentionIdx = 0;
  const lower = text.toLowerCase();

  while (i < text.length) {
    if (text[i] === "@" && isBoundaryBefore(text[i - 1])) {
      let matchedLen = 0;
      for (const label of labels) {
        const candidate = label.toLowerCase();
        if (lower.slice(i, i + candidate.length) !== candidate) continue;
        if (!isBoundaryAfter(text[i + candidate.length])) continue;
        matchedLen = candidate.length;
        break;
      }

      // Fallback: highlight raw @username/@display_name tokens even if they are not in mentionLabels.
      if (matchedLen === 0) {
        let j = i + 1;
        while (j < text.length && !isBoundaryAfter(text[j])) j += 1;
        const token = text.slice(i, j);
        if (token.length > 1 && fallbackMentionPattern.test(token)) {
          matchedLen = token.length;
        }
      }

      if (matchedLen > 0) {
        if (i > chunkStart) nodes.push(text.slice(chunkStart, i));
        const token = text.slice(i, i + matchedLen);
        nodes.push(
          <span
            key={`mention-${mentionIdx++}-${i}`}
            className="inline-flex items-center rounded-full px-1.5 py-0.5 mx-0.5 align-baseline bg-cyan-500/18 border border-cyan-400/45 text-cyan-200 text-[12px] font-medium"
          >
            {token}
          </span>,
        );
        i += matchedLen;
        chunkStart = i;
        continue;
      }
    }
    i += 1;
  }

  if (chunkStart < text.length) nodes.push(text.slice(chunkStart));
  return nodes.length ? nodes : [text];
}
