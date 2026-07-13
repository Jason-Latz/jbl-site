/** Rough word/read-time stats for the editor status line. */

const WORDS_PER_MINUTE = 225;

export function countWords(markdown: string): number {
  const trimmed = markdown.trim();
  if (trimmed === "") {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

export function readingTimeMinutes(words: number): number {
  if (words <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** e.g. "0 words", "1 word · 1 min read", "812 words · 4 min read". */
export function describeLength(markdown: string): string {
  const words = countWords(markdown);
  if (words === 0) {
    return "0 words";
  }
  const label = words === 1 ? "1 word" : `${words.toLocaleString()} words`;
  return `${label} · ${readingTimeMinutes(words)} min read`;
}
