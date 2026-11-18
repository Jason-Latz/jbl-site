import type { Root, RootContent } from "hast";
import { MarkdownAsync } from "react-markdown";
import remarkGfm from "remark-gfm";
import { countWords, readingTimeMinutes } from "@/lib/editor/text";

export type WritingHeading = { id: string; title: string; level: number };

function renderedText(node: RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return "";
  if (node.tagName === "img") return String(node.properties.alt ?? "");
  if (node.tagName === "br") return " ";
  return node.children.map(renderedText).join("");
}

export async function renderWritingMarkdown(markdown: string) {
  const headings: WritingHeading[] = [];
  const textBlocks: string[] = [];
  const usedIds = new Set<string>();

  // Collect the outline from the same tree that renders the article. Only
  // top-level headings introduce sections, so quoted headings and the
  // generated footnote label stay out of the outline.
  function collectArticleDetails() {
    return (tree: Root) => {
      for (const node of tree.children) {
        if (node.type !== "element" || "dataFootnotes" in node.properties) continue;

        const text = renderedText(node);
        textBlocks.push(text);
        if (!/^h[1-6]$/.test(node.tagName)) continue;

        const title = text.replace(/\s+/g, " ").trim();
        if (!title) continue;

        const slug = title.normalize("NFC").toLowerCase()
          .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
          .replace(/^-|-$/g, "");
        const base = `section-${slug || "heading"}`;
        let id = base;
        for (let suffix = 2; usedIds.has(id); suffix++) {
          id = `${base}-${suffix}`;
        }

        usedIds.add(id);
        node.properties.id = id;
        node.properties.tabIndex = -1;
        headings.push({ id, title, level: Number(node.tagName[1]) });
      }
    };
  }

  const body = await MarkdownAsync({
    children: markdown,
    remarkPlugins: [remarkGfm],
    rehypePlugins: [collectArticleDetails]
  });

  return { body, headings, minutes: readingTimeMinutes(countWords(textBlocks.join(" "))) };
}
