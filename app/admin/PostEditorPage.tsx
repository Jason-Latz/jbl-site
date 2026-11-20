"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Post } from "@/lib/postTypes";
import MarkdownEditor from "./MarkdownEditor";

type Fields = { title: string; slug: string; excerpt: string; content: string };
type SavedPost = Pick<Post, "id" | "published" | "published_at" | "updated_at"> & Fields;
type SaveAction = "save" | "autosave" | "publish" | "unpublish";

const blank: Fields = { title: "", slug: "", excerpt: "", content: "" };
const AUTOSAVE_MS = 1200;

function postFields(post: Pick<Post, keyof Fields>): Fields {
  return { title: post.title, slug: post.slug, excerpt: post.excerpt ?? "", content: post.content ?? "" };
}

function payloadFor(fields: Fields): Fields {
  return { title: fields.title.trim(), slug: fields.slug.trim(), excerpt: fields.excerpt.trim(), content: fields.content };
}

function signature(fields: Fields) {
  return JSON.stringify(payloadFor(fields));
}

function slugFromTitle(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function recoverFields(key: string, saved: SavedPost): Fields {
  const original = postFields(saved);
  try {
    const recovery = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (recovery?.id !== saved.id || recovery.updatedAt !== saved.updated_at) return original;
    const candidate = recovery.fields;
    return candidate && Object.keys(blank).every((field) => typeof candidate[field] === "string") ? candidate : original;
  } catch {
    return original;
  }
}

export default function PostEditorPage({ postId }: { postId?: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(blank);
  const [saved, setSaved] = useState<SavedPost | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(Boolean(postId));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState<SaveAction | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [failedSignature, setFailedSignature] = useState("");
  const autoSlug = useRef(!postId);
  const inFlight = useRef(false);
  const recoveryKey = postId ? `studio-draft-v1:${postId}` : "studio-new-draft-v1";
  const currentSignature = signature(fields);
  const dirty = currentSignature !== signature(saved ?? blank);
  const published = saved?.published ?? false;

  useEffect(() => {
    if (!postId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/posts/${postId}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (response.status === 401) { router.refresh(); return; }
        if (response.status === 403) { router.replace("/writings"); return; }
        if (!response.ok || !data.post) throw new Error(data.error ?? "Couldn’t open the article.");
        const post: Post = data.post;
        const next = { ...postFields(post), id: post.id, published: post.published, published_at: post.published_at, updated_at: post.updated_at };
        autoSlug.current = !next.published_at && next.slug.startsWith("draft-");
        setSaved(next);
        const recovered = recoverFields(recoveryKey, next);
        if (signature(recovered) !== signature(next)) setSuccess("Restored unsaved edits from this tab.");
        setFields(recovered);
      } catch (err) {
        if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : "Couldn’t open the article.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [postId, recoveryKey, router, loadAttempt]);

  useEffect(() => {
    if (!saved) return;
    try {
      if (dirty) {
        sessionStorage.setItem(recoveryKey, JSON.stringify({ id: saved.id, updatedAt: saved.updated_at, fields }));
      } else {
        sessionStorage.removeItem(recoveryKey);
      }
    } catch {
      // Saving and leaving warnings still work when browser storage is disabled.
    }
  }, [dirty, fields, recoveryKey, saved]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = true; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(async (action: SaveAction) => {
    if (inFlight.current) return;
    const payload = payloadFor(fields);
    const submittedSignature = signature(payload);
    const makePublic = action === "publish" || (action !== "unpublish" && Boolean(saved?.published));
    if (!payload.title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)) {
      if (action !== "autosave") setError("Add a title and check the post URL in Post settings.");
      return;
    }
    if (makePublic && (!payload.content.trim() || payload.title === "Untitled draft")) {
      setError("Add a title and some writing before publishing.");
      return;
    }
    if (action === "unpublish" && !window.confirm("Take this article off the public site? It will stay in Drafts.")) return;
    inFlight.current = true;
    setSaving(action);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(postId ? `/api/posts/${postId}` : "/api/posts", {
        method: postId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, published: makePublic, ...(saved ? { expectedUpdatedAt: saved.updated_at } : {}) })
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) router.refresh();
      if (response.status === 403) router.replace("/writings");
      if (!response.ok || !data.post) throw new Error(data.error ?? "Couldn’t save this article.");
      const post: Post = data.post;
      setSaved({ ...postFields(post), id: post.id, published: post.published, published_at: post.published_at, updated_at: post.updated_at });
      if (post.published_at) autoSlug.current = false;
      setFailedSignature("");
      setSuccess(action === "unpublish" ? "Moved to Drafts." : post.published ? "Public article updated." : "Draft saved.");
      if (!postId) router.replace(`/admin/${post.id}`);
    } catch (err) {
      setFailedSignature(submittedSignature);
      setError(err instanceof Error ? err.message : "Couldn’t save this article.");
    } finally {
      inFlight.current = false;
      setSaving(null);
    }
  }, [fields, postId, router, saved]);

  useEffect(() => {
    if (!postId || !saved || published || !dirty || saving || failedSignature === currentSignature) return;
    const timer = setTimeout(() => void save("autosave"), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [currentSignature, dirty, failedSignature, postId, published, save, saved, saving]);

  const keyboardSave = useCallback(() => { void save("save"); }, [save]);

  function change<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({
      ...current,
      [key]: value,
      ...(key === "title" && autoSlug.current ? { slug: slugFromTitle(value) || saved?.slug || "" } : {})
    }));
  }

  if (loading) return <p role="status">Opening the article…</p>;
  if (loadError) return (
    <section>
      <h1>Article</h1>
      <p role="alert">{loadError}</p>
      <div className="studio-actions">
        <button className="secondary" onClick={() => { setLoadError(""); setLoading(true); setLoadAttempt((count) => count + 1); }}>Try again</button>
        <Link href="/admin">All writing</Link>
      </div>
    </section>
  );

  return (
    <section className="studio-writer">
      <h1 className="sr-only">Article editor</h1>
      <div className="studio-actions">
        <Link href="/admin" prefetch={false} onClick={(event) => {
          if (dirty && !postId && !window.confirm("Leave this unsaved draft?")) event.preventDefault();
        }}>← All writing</Link>
        {published && saved ? <a href={`/writings/${saved.slug}`} target="_blank" rel="noreferrer">View live ↗</a> : null}
        <span className="studio-write-status" role="status">
          {saving ? "Saving…" : dirty ? published ? "Unpublished edits" : "Unsaved draft edits" : success || (published ? "Published" : "Draft")}
        </span>
      </div>
      <label className="form-field">
        <span className="sr-only">Article title</span>
        <input
          className="studio-title-input" value={fields.title} placeholder="Article title"
          onChange={(event) => change("title", event.currentTarget.value)}
        />
      </label>
      <details className="studio-settings">
        <summary>Post settings</summary>
        <label className="form-field">Post URL
          <input spellCheck={false} value={fields.slug} onChange={(event) => { autoSlug.current = false; change("slug", event.currentTarget.value); }} />
        </label>
        <label className="form-field">Excerpt
          <textarea rows={2} value={fields.excerpt} onChange={(event) => change("excerpt", event.currentTarget.value)} />
        </label>
        {published ? <button type="button" className="studio-danger" disabled={Boolean(saving)} onClick={() => void save("unpublish")}>Unpublish article</button> : null}
      </details>
      <MarkdownEditor value={fields.content} onChange={(value) => change("content", value)} onSave={keyboardSave} disabled={Boolean(saving && !postId)} />
      <div className="studio-actions">
        <button type="button" className={published ? "primary" : "secondary"} disabled={Boolean(saving)}
          onClick={() => void save("save")}>{published ? "Update public post" : "Save draft"}</button>
        {!published ? <button type="button" className="primary" disabled={Boolean(saving)} onClick={() => void save("publish")}>Publish</button> : null}
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
