"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TurndownService from "turndown";

type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

function getNextFootnoteIndex(markdown: string) {
  const matches = [...markdown.matchAll(/\[\^(\d+)\]/g)];
  const max = matches.reduce((largest, match) => {
    const parsed = Number(match[1]);
    if (Number.isNaN(parsed)) {
      return largest;
    }

    return Math.max(largest, parsed);
  }, 0);

  return max + 1;
}

export default function PostEditorPage({
  postId
}: {
  postId?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewEditableRef = useRef<HTMLDivElement | null>(null);
  const previewMarkdownSourceRef = useRef<HTMLDivElement | null>(null);
  const turndown = useMemo(
    () =>
      new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced"
      }),
    []
  );

  const [session, setSession] = useState<Session | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loadingPost, setLoadingPost] = useState(Boolean(postId));
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [published, setPublished] = useState(false);
  const [content, setContent] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const [previewDirty, setPreviewDirty] = useState(false);
  const [visualHtml, setVisualHtml] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (!postId) {
      setLoadingPost(false);
      setLoadError("");
      return;
    }

    const loadPost = async () => {
      setLoadingPost(true);
      setLoadError("");

      try {
        const response = await fetch(`/api/posts/${postId}`, {
          cache: "no-store"
        });
        const data = (await response.json()) as { error?: string; post?: Post };

        if (!response.ok) {
          const message = data.error ?? "Unable to load this post.";
          setLoadError(message);

          if (response.status === 401) {
            await supabase.auth.signOut();
          } else if (response.status === 403) {
            router.replace("/writings");
          }

          return;
        }

        if (!data.post) {
          setLoadError("Post not found.");
          return;
        }

        setTitle(data.post.title);
        setSlug(data.post.slug);
        setExcerpt(data.post.excerpt ?? "");
        setPublished(data.post.published);
        setContent(data.post.content ?? "");
        setSlugEdited(true);
      } catch {
        setLoadError("Unable to load this post.");
      } finally {
        setLoadingPost(false);
      }
    };

    void loadPost();
  }, [postId, router, session, supabase]);

  const handleSignIn = async () => {
    setAuthMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setAuthMessage(error.message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setStatusMessage("");
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  };

  const insertAroundSelection = (
    before: string,
    after = "",
    placeholder = "text"
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((current) => `${current}${before}${placeholder}${after}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end) || placeholder;

    const nextContent =
      content.slice(0, start) + before + selected + after + content.slice(end);

    setContent(nextContent);

    requestAnimationFrame(() => {
      textarea.focus();
      const selectionStart = start + before.length;
      const selectionEnd = selectionStart + selected.length;
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const insertLinePrefix = (prefix: string, placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((current) => `${current}\n${prefix}${placeholder}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end) || placeholder;

    const lines = selected.split("\n").map((line) => `${prefix}${line}`);
    const replacement = lines.join("\n");

    const nextContent = content.slice(0, start) + replacement + content.slice(end);
    setContent(nextContent);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + replacement.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const insertFootnote = () => {
    const index = getNextFootnoteIndex(content);
    const reference = `[^${index}]`;
    const definition = `\n\n[^${index}]: Footnote text.`;

    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((current) => `${current}${reference}${definition}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);
    const withReference = selected ? `${selected}${reference}` : `note${reference}`;

    const nextContent =
      content.slice(0, start) + withReference + content.slice(end) + definition;

    setContent(nextContent);

    requestAnimationFrame(() => {
      textarea.focus();
      const definitionStart = nextContent.lastIndexOf("Footnote text.");
      const definitionEnd = definitionStart + "Footnote text.".length;
      textarea.setSelectionRange(definitionStart, definitionEnd);
    });
  };

  useEffect(() => {
    if (editorMode !== "preview" || previewDirty) {
      return;
    }

    const sourceHtml = previewMarkdownSourceRef.current?.innerHTML ?? "";
    setVisualHtml(sourceHtml);
  }, [content, editorMode, previewDirty]);

  const applyPreviewEdits = () => {
    const editable = previewEditableRef.current;
    if (!editable) {
      return content;
    }

    const nextMarkdown = turndown.turndown(editable.innerHTML).trim();

    if (nextMarkdown !== content) {
      setContent(nextMarkdown);
      setStatusMessage("Preview edits applied. Save to persist.");
    }

    setPreviewDirty(false);
    return nextMarkdown;
  };

  const handleSave = async () => {
    setStatusMessage("");

    let nextContent = content;
    if (editorMode === "preview" && previewDirty) {
      nextContent = applyPreviewEdits();
    }

    const payload = {
      title,
      slug,
      excerpt: excerpt || null,
      content: nextContent,
      published
    };

    setSaving(true);

    try {
      const response = await fetch(postId ? `/api/posts/${postId}` : "/api/posts", {
        method: postId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = (await response.json()) as { error?: string; post?: Post };

      if (!response.ok) {
        setStatusMessage(data.error ?? "Unable to save post.");

        if (response.status === 401) {
          await supabase.auth.signOut();
        } else if (response.status === 403) {
          router.replace("/writings");
        }

        return;
      }

      setStatusMessage(postId ? "Post updated." : "Post created.");

      if (!postId && data.post?.id) {
        router.replace(`/admin/${data.post.id}`);
        router.refresh();
      }
    } catch {
      setStatusMessage("Unable to save post.");
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <div className="card auth-panel">
        <h2>Editor sign in</h2>
        <div className="form-grid">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="primary" onClick={handleSignIn}>
            Sign in
          </button>
          {authMessage && <p className="post-meta">{authMessage}</p>}
        </div>
      </div>
    );
  }

  if (loadingPost) {
    return <p className="post-meta">Loading editor...</p>;
  }

  if (loadError) {
    return (
      <div className="card">
        <p>{loadError}</p>
        <div className="editor-toolbar">
          <Link className="secondary" href="/admin">
            Back to posts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-shell">
      <div className="editor-toolbar">
        <Link className="secondary" href="/admin">
          Back to posts
        </Link>
        <button className="secondary" onClick={handleSignOut}>
          Sign out
        </button>
        {published && slug && (
          <a
            className="secondary"
            href={`/writings/${slug}`}
            target="_blank"
            rel="noreferrer"
          >
            View published
          </a>
        )}
      </div>

      <div className="card editor-panel editor-single-pane">
        <div className="form-grid meta-grid">
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
          />
          <input
            type="text"
            placeholder="Slug"
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugEdited(true);
            }}
          />
          <textarea
            placeholder="Short excerpt"
            rows={3}
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={published}
              onChange={(event) => setPublished(event.target.checked)}
            />
            <span>Published</span>
          </label>
        </div>

        <div className="editor-toolbar editor-mode-toggle" role="tablist">
          <button
            type="button"
            className={editorMode === "write" ? "mode-active" : ""}
            onClick={() => {
              if (editorMode === "preview" && previewDirty) {
                applyPreviewEdits();
              }
              setEditorMode("write");
            }}
          >
            Markdown
          </button>
          <button
            type="button"
            className={editorMode === "preview" ? "mode-active" : ""}
            onClick={() => {
              setPreviewDirty(false);
              setEditorMode("preview");
            }}
          >
            Visual
          </button>
        </div>

        {editorMode === "write" ? (
          <>
            <div className="editor-toolbar markdown-toolbar">
              <button
                className="secondary"
                type="button"
                onClick={() => insertAroundSelection("**", "**", "bold")}
              >
                Bold
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => insertAroundSelection("*", "*", "italic")}
              >
                Italic
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => insertLinePrefix("## ", "Heading")}
              >
                H2
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => insertLinePrefix("> ", "Quote")}
              >
                Quote
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  insertAroundSelection("[", "](https://example.com)", "link")
                }
              >
                Link
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => insertAroundSelection("`", "`", "code")}
              >
                Inline code
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  insertAroundSelection("\n```\n", "\n```\n", "code block")
                }
              >
                Code block
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => insertLinePrefix("- ", "List item")}
              >
                Bulleted list
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => insertLinePrefix("1. ", "List item")}
              >
                Numbered list
              </button>
              <button
                className="secondary"
                type="button"
                onClick={insertFootnote}
              >
                Footnote
              </button>
            </div>

            <textarea
              ref={textareaRef}
              className="markdown-editor"
              placeholder="Write your article in Markdown..."
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </>
        ) : (
          <article className="editor-preview-surface">
            <h1>{title || "Untitled article"}</h1>
            <p className="post-meta">{published ? "Published" : "Draft"}</p>
            {excerpt && <p className="editor-preview-excerpt">{excerpt}</p>}
            <p className="post-meta preview-edit-hint">
              You can edit directly here. Click “Apply preview edits” before saving.
            </p>
            <div className="preview-markdown-source" aria-hidden ref={previewMarkdownSourceRef}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content || " "}
              </ReactMarkdown>
            </div>
            <div
              ref={previewEditableRef}
              className="content preview-editable-area"
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{
                __html: visualHtml || "<p>Start writing in Markdown mode.</p>"
              }}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("a")) {
                  event.preventDefault();
                }
              }}
              onInput={() =>
                setPreviewDirty((currentValue) =>
                  currentValue ? currentValue : true
                )
              }
            />
            <div className="editor-toolbar">
              <button
                className="secondary"
                type="button"
                onClick={applyPreviewEdits}
                disabled={!previewDirty}
              >
                Apply preview edits
              </button>
            </div>
          </article>
        )}

        <div className="editor-toolbar">
          <button className="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : postId ? "Save changes" : "Create article"}
          </button>
          {statusMessage && <p className="post-meta">{statusMessage}</p>}
        </div>
        <p className="post-meta">
          Markdown supported, including footnotes (`[^1]` with `[^1]: note`).
        </p>
      </div>
    </div>
  );
}
