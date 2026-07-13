"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  continueList,
  indentSelection,
  insertCodeBlock,
  insertFootnote,
  insertInlineCode,
  insertLink,
  linkifyPaste,
  toggleBulletList,
  toggleHeading,
  toggleNumberedList,
  toggleQuote,
  wrapSelection,
  type EditorState
} from "@/lib/editor/markdownCommands";
import { describeLength } from "@/lib/editor/text";

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

type SavePayload = {
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  published: boolean;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const getPayloadSignature = (payload: SavePayload) => JSON.stringify(payload);
const AUTOSAVE_DELAY_MS = 1500;

export default function PostEditorPage({
  postId
}: {
  postId?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loadingPost, setLoadingPost] = useState(Boolean(postId));
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [autosaveMessage, setAutosaveMessage] = useState("");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [published, setPublished] = useState(false);
  const [content, setContent] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [editorMode, setEditorMode] = useState<"write" | "preview">("write");
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

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
      setSavedSignature(null);
      setAutosaveMessage("");
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
        const nextContent = data.post.content ?? "";
        setContent(nextContent);
        setSlugEdited(true);
        const loadedPayload: SavePayload = {
          title: data.post.title.trim(),
          slug: data.post.slug.trim(),
          excerpt: (data.post.excerpt ?? "").trim() || null,
          content: nextContent,
          published: data.post.published
        };
        setSavedSignature(getPayloadSignature(loadedPayload));
        setAutosaveMessage("All changes saved.");
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
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    await supabase.auth.signOut();
    setStatusMessage("");
    setAutosaveMessage("");
    setSavedSignature(null);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  };

  const buildPayload = useCallback(
    (contentValue = content): SavePayload => ({
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim() || null,
      content: contentValue,
      published
    }),
    [content, excerpt, published, slug, title]
  );

  const currentPayloadSignature = useMemo(
    () => getPayloadSignature(buildPayload()),
    [buildPayload]
  );

  const persistPost = useCallback(
    async ({
      source,
      contentOverride
    }: {
      source: "manual" | "autosave";
      contentOverride?: string;
    }) => {
      if (saving || (source === "autosave" && !postId)) {
        return;
      }

      const payload = buildPayload(contentOverride);
      if (!payload.title || !payload.slug) {
        if (source === "manual") {
          setStatusMessage("Title and slug are required.");
        } else {
          setAutosaveMessage("Autosave paused until title and slug are filled.");
        }
        return;
      }

      if (source === "manual") {
        setStatusMessage("");
      } else {
        setAutosaveMessage("Autosaving...");
      }

      setSaving(true);

      try {
        const response = await fetch(postId ? `/api/posts/${postId}` : "/api/posts", {
          method: postId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const data = (await response.json()) as { error?: string; post?: Post };

        if (!response.ok) {
          const message = data.error ?? "Unable to save post.";
          if (source === "manual") {
            setStatusMessage(message);
          } else {
            setAutosaveMessage(`Autosave failed: ${message}`);
          }

          if (response.status === 401) {
            await supabase.auth.signOut();
          } else if (response.status === 403) {
            router.replace("/writings");
          }

          return;
        }

        setSavedSignature(getPayloadSignature(payload));

        if (source === "manual") {
          setStatusMessage(postId ? "Post updated." : "Post created.");
        } else {
          const savedAt = new Date().toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit"
          });
          setAutosaveMessage(`Autosaved at ${savedAt}.`);
        }

        if (!postId && data.post?.id) {
          router.replace(`/admin/${data.post.id}`);
          router.refresh();
        }
      } catch {
        if (source === "manual") {
          setStatusMessage("Unable to save post.");
        } else {
          setAutosaveMessage("Autosave failed.");
        }
      } finally {
        setSaving(false);
      }
    },
    [buildPayload, postId, router, saving, supabase]
  );

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!postId || !session || loadingPost || !savedSignature || saving) {
      return;
    }

    if (currentPayloadSignature === savedSignature) {
      setAutosaveMessage("All changes saved.");
      return;
    }

    const payload = buildPayload();
    if (!payload.title || !payload.slug) {
      setAutosaveMessage("Autosave paused until title and slug are filled.");
      return;
    }

    setAutosaveMessage("Unsaved changes...");
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistPost({ source: "autosave" });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [
    buildPayload,
    currentPayloadSignature,
    loadingPost,
    persistPost,
    postId,
    savedSignature,
    saving,
    session
  ]);

  const handleSave = useCallback(() => {
    void persistPost({ source: "manual" });
  }, [persistPost]);

  const readEditorState = useCallback((): EditorState => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return {
        value: content,
        selectionStart: content.length,
        selectionEnd: content.length
      };
    }
    return {
      value: content,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd
    };
  }, [content]);

  const applyEditorState = useCallback((next: EditorState) => {
    setContent(next.value);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
      }
    });
  }, []);

  const runCommand = useCallback(
    (command: (state: EditorState) => EditorState) => {
      applyEditorState(command(readEditorState()));
    },
    [applyEditorState, readEditorState]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const mod = event.metaKey || event.ctrlKey;

      if (mod && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "b") {
          event.preventDefault();
          runCommand((state) => wrapSelection(state, "**", "**", "bold"));
          return;
        }
        if (key === "i") {
          event.preventDefault();
          runCommand((state) => wrapSelection(state, "*", "*", "italic"));
          return;
        }
        if (key === "k") {
          event.preventDefault();
          runCommand(insertLink);
          return;
        }
        if (key === "s") {
          event.preventDefault();
          handleSave();
          return;
        }
      }

      if (event.key === "Tab") {
        event.preventDefault();
        runCommand((state) => indentSelection(state, event.shiftKey));
        return;
      }

      if (event.key === "Enter" && !event.shiftKey && !mod) {
        const result = continueList(readEditorState());
        if (result.handled) {
          event.preventDefault();
          applyEditorState(result.state);
        }
      }
    },
    [applyEditorState, handleSave, readEditorState, runCommand]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = event.clipboardData.getData("text");
      const result = linkifyPaste(readEditorState(), pasted);
      if (result.handled) {
        event.preventDefault();
        applyEditorState(result.state);
      }
    },
    [applyEditorState, readEditorState]
  );

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
            onClick={() => setEditorMode("write")}
          >
            Write
          </button>
          <button
            type="button"
            className={editorMode === "preview" ? "mode-active" : ""}
            onClick={() => setEditorMode("preview")}
          >
            Preview
          </button>
        </div>

        {editorMode === "write" ? (
          <>
            <div className="editor-toolbar markdown-toolbar">
              <button
                className="secondary"
                type="button"
                title="Bold (⌘B)"
                onClick={() => runCommand((s) => wrapSelection(s, "**", "**", "bold"))}
              >
                Bold
              </button>
              <button
                className="secondary"
                type="button"
                title="Italic (⌘I)"
                onClick={() => runCommand((s) => wrapSelection(s, "*", "*", "italic"))}
              >
                Italic
              </button>
              <button
                className="secondary"
                type="button"
                title="Heading"
                onClick={() => runCommand(toggleHeading)}
              >
                H2
              </button>
              <button
                className="secondary"
                type="button"
                title="Quote"
                onClick={() => runCommand(toggleQuote)}
              >
                Quote
              </button>
              <button
                className="secondary"
                type="button"
                title="Link (⌘K)"
                onClick={() => runCommand(insertLink)}
              >
                Link
              </button>
              <button
                className="secondary"
                type="button"
                title="Inline code"
                onClick={() => runCommand(insertInlineCode)}
              >
                Inline code
              </button>
              <button
                className="secondary"
                type="button"
                title="Code block"
                onClick={() => runCommand(insertCodeBlock)}
              >
                Code block
              </button>
              <button
                className="secondary"
                type="button"
                title="Bulleted list"
                onClick={() => runCommand(toggleBulletList)}
              >
                Bulleted list
              </button>
              <button
                className="secondary"
                type="button"
                title="Numbered list"
                onClick={() => runCommand(toggleNumberedList)}
              >
                Numbered list
              </button>
              <button
                className="secondary"
                type="button"
                title="Footnote"
                onClick={() => runCommand(insertFootnote)}
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
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              spellCheck
            />
          </>
        ) : (
          <div className="editor-preview-surface">
            <article className="content">
              <h1>{title || "Untitled article"}</h1>
              <p className="post-meta">{published ? "Published" : "Draft"}</p>
              {excerpt && <p className="editor-preview-excerpt">{excerpt}</p>}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content.trim() ? content : "_Nothing to preview yet._"}
              </ReactMarkdown>
            </article>
          </div>
        )}

        <div className="editor-statusbar">
          <span className="post-meta editor-count">{describeLength(content)}</span>
          <span className="post-meta editor-hint">
            Markdown supported · ⌘B bold · ⌘I italic · ⌘K link · ⌘S save
          </span>
        </div>

        <div className="editor-toolbar">
          <button className="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : postId ? "Save changes" : "Create article"}
          </button>
          {statusMessage && <p className="post-meta">{statusMessage}</p>}
          {postId && autosaveMessage && <p className="post-meta">{autosaveMessage}</p>}
        </div>
      </div>
    </div>
  );
}
