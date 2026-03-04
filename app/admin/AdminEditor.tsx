"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

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

type PhotoUploadResponse = {
  error?: string;
  uploadedCount?: number;
  failedCount?: number;
  failed?: { name: string; reason: string }[];
};

function formatPostDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export default function AdminEditor() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [photoUploadMessage, setPhotoUploadMessage] = useState("");
  const [photoUploadError, setPhotoUploadError] = useState("");
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    setPostsError("");
    setSelectedPhotos([]);
    setPhotoUploadError("");
    setPhotoUploadMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePhotoSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedPhotos(files);
    setPhotoUploadError("");
    setPhotoUploadMessage("");
  };

  const handlePhotoUpload = async () => {
    if (selectedPhotos.length === 0 || uploadingPhotos) {
      return;
    }

    setUploadingPhotos(true);
    setPhotoUploadError("");
    setPhotoUploadMessage("");

    const formData = new FormData();
    selectedPhotos.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const response = await fetch("/api/photos", {
        method: "POST",
        body: formData
      });

      const data = (await response.json()) as PhotoUploadResponse;

      if (!response.ok) {
        setPhotoUploadError(data.error ?? "Unable to upload photos.");
        return;
      }

      const uploadedCount = data.uploadedCount ?? 0;
      const failedCount = data.failedCount ?? 0;
      const failedNames = (data.failed ?? [])
        .slice(0, 5)
        .map((item) => item.name)
        .join(", ");

      let summary = `Uploaded ${uploadedCount} photo${uploadedCount === 1 ? "" : "s"}.`;
      if (failedCount > 0) {
        summary += ` ${failedCount} failed${failedNames ? ` (${failedNames})` : ""}.`;
      }

      setPhotoUploadMessage(summary);
      setSelectedPhotos([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      setPhotoUploadError("Unable to upload photos.");
    } finally {
      setUploadingPhotos(false);
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
        <Link className="secondary" href="/admin/new">
          New article
        </Link>
        <Link className="secondary" href="/photography" target="_blank">
          View photography page
        </Link>
        <button className="secondary" onClick={handleSignOut}>
          Sign out
        </button>
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
                    {formatPostDate(post.published_at)
                      ? ` · ${formatPostDate(post.published_at)}`
                      : ""}
                  </div>
                </div>
                <div className="editor-toolbar">
                  <Link className="secondary" href={`/admin/${post.id}`}>
                    Edit
                  </Link>
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

      <div className="section">
        <h3>Photography uploads</h3>
        <p className="post-meta">
          Select multiple images and upload them in one batch. They will appear on
          the photography page automatically.
        </p>
        <div className="card photo-upload-panel">
          <div className="form-grid">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              disabled={uploadingPhotos}
            />
            <div className="editor-toolbar">
              <button
                className="primary"
                onClick={handlePhotoUpload}
                disabled={uploadingPhotos || selectedPhotos.length === 0}
              >
                {uploadingPhotos
                  ? "Uploading..."
                  : `Upload ${
                      selectedPhotos.length > 0 ? selectedPhotos.length : ""
                    } photo${selectedPhotos.length === 1 ? "" : "s"}`}
              </button>
            </div>
            <p className="post-meta">
              Recommended: JPG, PNG, or WebP. Keep files under 25MB each.
            </p>
            {photoUploadMessage && <p className="post-meta">{photoUploadMessage}</p>}
            {photoUploadError && <p className="post-meta">{photoUploadError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
