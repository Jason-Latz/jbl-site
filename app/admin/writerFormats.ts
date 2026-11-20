export const writerFormats = [
  { id: "bold", label: "Bold", symbol: "B", shortcut: "Control+B Meta+B" },
  { id: "italic", label: "Italic", symbol: "I", shortcut: "Control+I Meta+I" },
  { id: "heading", label: "Heading", symbol: "H2" },
  { id: "link", label: "Link", symbol: "", shortcut: "Control+K Meta+K" },
  { id: "bullets", label: "Bulleted list", symbol: "•≡" },
  { id: "numbers", label: "Numbered list", symbol: "1≡" },
  { id: "quote", label: "Quote", symbol: "❞" },
  { id: "inlineCode", label: "Inline code", symbol: "‹/›" },
  { id: "codeBlock", label: "Code block", symbol: "" },
  { id: "footnote", label: "Footnote", symbol: "" }
] as const;

export type WriterFormat = (typeof writerFormats)[number]["id"];
export type ApplyVisualFormat = (format: Exclude<WriterFormat, "footnote">, href?: string) => void;

export function allowedLink(value: string) {
  if (!/^(https?:\/\/|mailto:|\/(?!\/)|#)\S+$/i.test(value)) return false;
  try {
    const url = new URL(value, "https://www.jasonlatz.com");
    return ["https:", "http:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}
