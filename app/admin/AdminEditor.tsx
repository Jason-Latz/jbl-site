"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session } from "@supabase/supabase-js";
import LinkExtension from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

export default function AdminEditor() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [posts, setPosts] = useState<Post[]>([]);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [published, setPublished] = useState(false);
  const [content, setContent] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [postsError, setPostsError] = useState("");

  const editor = useEditor({
    extensions: [StarterKit, LinkExtension.configure({ openOnClick: false })],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor: activeEditor }) => {
      setContent(activeEditor.getHTML());
    }
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const editorContent = editor.getHTML();
    if (editorContent !== content) {
      editor.commands.setContent(content || "");
    }
  }, [editor, activePostId, content]);

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

    const loadPosts = async () => {
      setLoadingPosts(true);
      setPostsError("");

      try {
        const response = await fetch("/api/posts", { cache: "no-store" });
        const data = (await response.json()) as { error?: string; posts?: Post[] };

        if (!response.ok) {
          const message = data.error ?? "Unable to load posts.";
          setPosts([]);
          setPostsError(message);

          if (response.status === 401) {
            await supabase.auth.signOut();
          } else if (response.status === 403) {
            router.replace("/writings");
          }

          return;
        }

        setPosts(data.posts ?? []);
      } catch {
        setPosts([]);
        setPostsError("Unable to load posts.");
      } finally {
        setLoadingPosts(false);
      }
    };

    void loadPosts();
  }, [router, session, supabase]);

  const resetForm = () => {
    setActivePostId(null);
    setTitle("");
    setSlug("");
    setExcerpt("");
    setPublished(false);
    setContent("");
    setSlugEdited(false);
    setStatusMessage("");
    setPostsError("");
  };

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
    setPosts([]);
    resetForm();
  };

  const handleEdit = (post: Post) => {
    setActivePostId(post.id);
    setTitle(post.title);
    setSlug(post.slug);
    setExcerpt(post.excerpt ?? "");
    setPublished(post.published);
    setContent(post.content ?? "");
    setSlugEdited(true);
    setStatusMessage("");
  };

  const handleSave = async () => {
    setStatusMessage("");

    const payload = {
      title,
      slug,
      excerpt: excerpt || null,
      content,
      published
    };

    const response = await fetch(
      activePostId ? `/api/posts/${activePostId}` : "/api/posts",
      {
        method: activePostId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();
    if (!response.ok) {
      setStatusMessage(data.error ?? "Something went wrong.");

      if (response.status === 401) {
        await supabase.auth.signOut();
      } else if (response.status === 403) {
        router.replace("/writings");
      }

      return;
    }

    setStatusMessage(activePostId ? "Post updated." : "Post created.");
    setActivePostId(data.post?.id ?? activePostId);
    setSlugEdited(true);

    const refreshed = await fetch("/api/posts", { cache: "no-store" });
    const refreshedData = await refreshed.json();
    if (refreshed.ok) {
      setPosts(refreshedData.posts ?? []);
      setPostsError("");
    } else {
      setPostsError(refreshedData.error ?? "Unable to refresh posts.");
    }
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugEdited) {
      setSlug(slugify(value));
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

  return (
    <div className="editor-shell">
      <div className="editor-toolbar">
        <button className="secondary" onClick={resetForm}>
          New draft
        </button>
        <button className="secondary" onClick={handleSignOut}>
          Sign out
        </button>
      </div>

      <div className="card">
        <div className="form-grid">
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
          <label className="post-meta">
            <input
              type="checkbox"
              checked={published}
              onChange={(event) => setPublished(event.target.checked)}
            />{" "}
            Published
          </label>
        </div>

        <div className="section">
          <EditorContent editor={editor} className="editor" />
        </div>

        <div className="editor-toolbar">
          <button className="primary" onClick={handleSave}>
            {activePostId ? "Save changes" : "Publish"}
          </button>
          {statusMessage && <p className="post-meta">{statusMessage}</p>}
        </div>
      </div>

      <div className="section">
        <h3>Posts</h3>
        {postsError && <p className="post-meta">{postsError}</p>}
        {loadingPosts ? (
          <p className="post-meta">Loading...</p>
        ) : (
          <div className="post-grid">
            {posts.map((post) => (
              <div key={post.id} className="post-row">
                <div>
                  <strong>{post.title}</strong>
                  <div className="post-meta">
                    {post.published ? "Published" : "Draft"} · {post.slug}
                  </div>
                </div>
                <div className="editor-toolbar">
                  <button className="secondary" onClick={() => handleEdit(post)}>
                    Edit
                  </button>
                  {post.published && (
                    <a
                      className="secondary"
                      href={`/writings/${post.slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {posts.length === 0 && !loadingPosts && !postsError && (
          <p className="post-meta">No posts yet.</p>
        )}
      </div>
    </div>
  );
}
