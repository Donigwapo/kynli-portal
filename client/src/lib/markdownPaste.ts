export function removeFragmentMarkerLines(input: string): string {
  return input
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "StartFragment" && trimmed !== "EndFragment";
    })
    .join("\n");
}

function normalizePlainText(input: string): string {
  return removeFragmentMarkerLines(
    input
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[\t\f\v]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function extractTextExcludingNestedLists(li: HTMLLIElement): string {
  const clone = li.cloneNode(true) as HTMLLIElement;
  clone.querySelectorAll("ul,ol").forEach((nested) => nested.remove());

  return normalizePlainText(clone.textContent ?? "")
    .replace(/^\s*(?:[-*+•]\s+|\d+[.)]\s+)/, "")
    .trim();
}

function listToMarkdown(listEl: HTMLOListElement | HTMLUListElement, depth = 0): string {
  const isOrdered = listEl.tagName.toLowerCase() === "ol";
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  const items = Array.from(listEl.children).filter((child): child is HTMLLIElement => {
    return child.tagName.toLowerCase() === "li";
  });

  items.forEach((li, index) => {
    const marker = isOrdered ? `${index + 1}.` : "-";
    const text = extractTextExcludingNestedLists(li);
    lines.push(text ? `${indent}${marker} ${text}` : `${indent}${marker}`);

    const nestedLists = Array.from(li.children).filter((child): child is HTMLOListElement | HTMLUListElement => {
      const tag = child.tagName.toLowerCase();
      return tag === "ul" || tag === "ol";
    });

    nestedLists.forEach((nested) => {
      const nestedMd = listToMarkdown(nested, depth + 1);
      if (nestedMd) lines.push(nestedMd);
    });
  });

  return lines.join("\n");
}

function extractNodeText(node: Node): string {
  if (node.nodeType === Node.COMMENT_NODE) return "";

  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").trim();
    if (text === "StartFragment" || text === "EndFragment") return "";
    return (node.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  }

  if (!(node instanceof Element)) return "";

  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "ul" || tag === "ol") return "";

  const raw = Array.from(node.childNodes)
    .map((child) => extractNodeText(child))
    .join("");

  return raw;
}

export function htmlWithListsToMarkdown(html: string): string | null {
  if (!html.trim()) return null;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  const hasList = !!body.querySelector("ul,ol");
  if (!hasList) return null;

  const blocks: string[] = [];

  const appendBlock = (value: string) => {
    const normalized = normalizePlainText(value);
    if (normalized) blocks.push(normalized);
  };

  Array.from(body.childNodes).forEach((node) => {
    if (node.nodeType === Node.COMMENT_NODE) return;

    if (node instanceof Element) {
      const tag = node.tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") {
        appendBlock(listToMarkdown(node as HTMLOListElement | HTMLUListElement));
        return;
      }

      if (node.querySelector("ul,ol")) {
        let textBuffer = "";
        Array.from(node.childNodes).forEach((child) => {
          if (child instanceof Element) {
            const childTag = child.tagName.toLowerCase();
            if (childTag === "ul" || childTag === "ol") {
              appendBlock(textBuffer);
              textBuffer = "";
              appendBlock(listToMarkdown(child as HTMLOListElement | HTMLUListElement));
              return;
            }
          }

          const next = extractNodeText(child);
          if (next) textBuffer += next;
        });

        appendBlock(textBuffer);
        return;
      }

      appendBlock(extractNodeText(node));
      return;
    }

    appendBlock(node.textContent ?? "");
  });

  const output = blocks.join("\n\n").trim();
  return output || null;
}

export function insertTextAtSelection(input: {
  currentValue: string;
  insertText: string;
  selectionStart: number;
  selectionEnd: number;
  maxLength?: number;
}): { value: string; cursor: number } {
  const before = input.currentValue.slice(0, input.selectionStart);
  const after = input.currentValue.slice(input.selectionEnd);
  const nextValue = `${before}${input.insertText}${after}`;

  const value = typeof input.maxLength === "number"
    ? nextValue.slice(0, input.maxLength)
    : nextValue;

  const cursor = Math.min(before.length + input.insertText.length, value.length);

  return { value, cursor };
}
