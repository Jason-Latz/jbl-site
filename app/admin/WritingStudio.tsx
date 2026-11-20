"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type PostSummary = {
  id: string; title: string; slug: string; published: boolean; published_at: string | null; updated_at: string | null;
};

export default function WritingStudio() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const creatingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/posts", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (response.status === 401) { router.refresh(); return; }
        if (response.status === 403) { router.replace("/writings"); return; }
        if (!response.ok) throw new Error(data.error ?? "Couldn’t load writing.");
        setPosts(data.posts);
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Couldn’t load writing.");
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt, router]);

  async function createDraft() {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setMessage("");
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled draft", slug: `draft-${crypto.randomUUID()}`, published: false, content: "" })
      });
      const data = await response.json();
      if (response.status === 401) router.refresh();
      if (response.status === 403) router.replace("/writings");
      if (!response.ok || !data.post?.id) throw new Error(data.error ?? "Couldn’t create the draft.");
      router.push(`/admin/${data.post.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn’t create the draft.");
      setCreating(false);
      creatingRef.current = false;
    }
  }

  return (
    <>
      <div className="studio-heading">
        <h1>Writing</h1>
        <button className="primary" type="button" disabled={creating} onClick={createDraft}>{creating ? "Creating draft…" : "New draft"}</button>
      </div>
      {message ? <p role="alert">{message} {posts === null ? <button className="secondary" onClick={() => { setMessage(""); setAttempt((value) => value + 1); }}>Try again</button> : null}</p> : null}
      {posts === null && !message ? <p role="status">Loading writing…</p> : null}
      {posts ? (
        <div className="studio-posts">
          {[false, true].map((published) => {
            const group = posts.filter((post) => post.published === published);
            return (
              <section key={String(published)}>
                <h2>{published ? "Published" : "Drafts"}</h2>
                {group.length ? (
                  <ul>
                    {group.map((post) => (
                      <li key={post.id}>
                        <Link href={`/admin/${post.id}`} prefetch={false}>{post.title}</Link>
                        {post.published ? <a href={`/writings/${post.slug}`} className="studio-muted">View</a> : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="studio-muted">{published ? "No published articles." : "No drafts yet."}</p>}
              </section>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
