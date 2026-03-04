"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type PhotoApiItem = {
  id: string | null;
  path: string;
  url: string | null;
  location: string | null;
  description: string | null;
  songTitle: string | null;
  songUrl: string | null;
  createdAt: string | null;
};

type EditablePhoto = {
  id: string | null;
  path: string;
  url: string;
  location: string;
  description: string;
  songTitle: string;
  songUrl: string;
  createdAt: string | null;
};

type PhotosListResponse = {
  error?: string;
  photos?: PhotoApiItem[];
};

type PhotoMetadataResponse = {
  error?: string;
  photo?: PhotoApiItem;
};

type PhotoDeleteResponse = {
  error?: string;
  deleted?: boolean;
  path?: string;
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

function toEditablePhoto(photo: PhotoApiItem): EditablePhoto {
  return {
    id: photo.id ?? null,
    path: photo.path,
    url: photo.url ?? "",
    location: photo.location ?? "",
    description: photo.description ?? "",
    songTitle: photo.songTitle ?? "",
    songUrl: photo.songUrl ?? "",
    createdAt: photo.createdAt ?? null
  };
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
  const [creatingDraft, setCreatingDraft] = useState(false);

  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [photoUploadMessage, setPhotoUploadMessage] = useState("");
  const [photoUploadError, setPhotoUploadError] = useState("");
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [photos, setPhotos] = useState<EditablePhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photosError, setPhotosError] = useState("");
  const [photoMetadataMessage, setPhotoMetadataMessage] = useState("");
  const [photoMetadataError, setPhotoMetadataError] = useState("");
  const [savingPhotoPath, setSavingPhotoPath] = useState<string | null>(null);
  const [deletingPhotoPath, setDeletingPhotoPath] = useState<string | null>(null);

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

  const loadPosts = useCallback(async () => {
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
  }, [router, supabase]);

  const loadPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    setPhotosError("");

    try {
      const response = await fetch("/api/photos", { cache: "no-store" });
      const data = (await response.json()) as PhotosListResponse;

      if (!response.ok) {
        const message = data.error ?? "Unable to load photos.";
        setPhotos([]);
        setPhotosError(message);

        if (response.status === 401) {
          await supabase.auth.signOut();
        } else if (response.status === 403) {
          router.replace("/writings");
        }

        return;
      }

      const nextPhotos = (data.photos ?? []).map(toEditablePhoto);
      setPhotos(nextPhotos);
    } catch {
      setPhotos([]);
      setPhotosError("Unable to load photos.");
    } finally {
      setLoadingPhotos(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    if (!session) {
      return;
    }

    void loadPosts();
    void loadPhotos();
  }, [session, loadPosts, loadPhotos]);

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
    setCreatingDraft(false);
    setSelectedPhotos([]);
    setPhotoUploadError("");
    setPhotoUploadMessage("");
    setPhotos([]);
    setPhotosError("");
    setPhotoMetadataError("");
    setPhotoMetadataMessage("");
    setSavingPhotoPath(null);
    setDeletingPhotoPath(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCreateDraft = async () => {
    if (creatingDraft) {
      return;
    }

    setCreatingDraft(true);
    setPostsError("");

    const timestampToken = Date.now().toString(36);
    const randomToken = Math.random().toString(36).slice(2, 7);
    const slug = `draft-${timestampToken}-${randomToken}`;

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled draft",
          slug,
          excerpt: null,
          content: "",
          published: false
        })
      });

      const data = (await response.json()) as { error?: string; post?: Post };

      if (!response.ok || !data.post?.id) {
        setPostsError(data.error ?? "Unable to create draft.");

        if (response.status === 401) {
          await supabase.auth.signOut();
        } else if (response.status === 403) {
          router.replace("/writings");
        }

        return;
      }

      router.push(`/admin/${data.post.id}`);
      router.refresh();
    } catch {
      setPostsError("Unable to create draft.");
    } finally {
      setCreatingDraft(false);
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
    setPhotoMetadataError("");
    setPhotoMetadataMessage("");

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

      await loadPhotos();
    } catch {
      setPhotoUploadError("Unable to upload photos.");
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handlePhotoFieldChange = (
    path: string,
    field: "location" | "description" | "songTitle" | "songUrl",
    value: string
  ) => {
    setPhotos((current) =>
      current.map((photo) =>
        photo.path === path ? { ...photo, [field]: value } : photo
      )
    );
  };

  const handleSavePhotoMetadata = async (path: string) => {
    const target = photos.find((photo) => photo.path === path);
    if (!target || savingPhotoPath) {
      return;
    }

    setSavingPhotoPath(path);
    setPhotoMetadataMessage("");
    setPhotoMetadataError("");

    try {
      const response = await fetch("/api/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: target.path,
          location: target.location,
          description: target.description,
          songTitle: target.songTitle,
          songUrl: target.songUrl
        })
      });

      const data = (await response.json()) as PhotoMetadataResponse;

      if (!response.ok) {
        setPhotoMetadataError(data.error ?? "Unable to save metadata.");
        return;
      }

      if (data.photo) {
        const next = toEditablePhoto(data.photo);
        setPhotos((current) =>
          current.map((photo) => (photo.path === path ? next : photo))
        );
      }

      setPhotoMetadataMessage("Photo metadata saved.");
    } catch {
      setPhotoMetadataError("Unable to save metadata.");
    } finally {
      setSavingPhotoPath(null);
    }
  };

  const handleDeletePhoto = async (path: string) => {
    if (savingPhotoPath || deletingPhotoPath) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this photo from the gallery? This will remove the image and metadata."
    );
    if (!confirmed) {
      return;
    }

    setDeletingPhotoPath(path);
    setPhotoMetadataMessage("");
    setPhotoMetadataError("");

    try {
      const response = await fetch("/api/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: path })
      });

      const data = (await response.json()) as PhotoDeleteResponse;

      if (!response.ok) {
        setPhotoMetadataError(data.error ?? "Unable to delete photo.");
        return;
      }

      setPhotos((current) => current.filter((photo) => photo.path !== path));
      setPhotoMetadataMessage("Photo deleted.");
    } catch {
      setPhotoMetadataError("Unable to delete photo.");
    } finally {
      setDeletingPhotoPath(null);
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
        <button className="secondary" onClick={handleCreateDraft} disabled={creatingDraft}>
          {creatingDraft ? "Creating draft..." : "New article"}
        </button>
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
              Recommended: JPG, PNG, WebP, or HEIC. Keep files under 25MB each.
            </p>
            {photoUploadMessage && <p className="post-meta">{photoUploadMessage}</p>}
            {photoUploadError && <p className="post-meta">{photoUploadError}</p>}
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Photo metadata</h3>
        <p className="post-meta">
          Click a photo on the public photography page to see this metadata.
        </p>
        {photosError && <p className="post-meta">{photosError}</p>}
        {photoMetadataMessage && <p className="post-meta">{photoMetadataMessage}</p>}
        {photoMetadataError && <p className="post-meta">{photoMetadataError}</p>}

        {loadingPhotos ? (
          <p className="post-meta">Loading photos...</p>
        ) : photos.length === 0 ? (
          <p className="post-meta">No photos uploaded yet.</p>
        ) : (
          <div className="photo-admin-grid">
            {photos.map((photo) => (
              <div key={photo.path} className="card photo-admin-card">
                <img src={photo.url} alt={photo.path} className="photo-admin-thumb" />
                <p className="post-meta photo-admin-path">{photo.path}</p>
                <div className="form-grid">
                  <input
                    type="text"
                    placeholder="Location"
                    value={photo.location}
                    onChange={(event) =>
                      handlePhotoFieldChange(photo.path, "location", event.target.value)
                    }
                  />
                  <textarea
                    placeholder="Description"
                    value={photo.description}
                    onChange={(event) =>
                      handlePhotoFieldChange(
                        photo.path,
                        "description",
                        event.target.value
                      )
                    }
                  />
                  <input
                    type="text"
                    placeholder="Song title (optional)"
                    value={photo.songTitle}
                    onChange={(event) =>
                      handlePhotoFieldChange(photo.path, "songTitle", event.target.value)
                    }
                  />
                  <input
                    type="url"
                    placeholder="Spotify URL (optional)"
                    value={photo.songUrl}
                    onChange={(event) =>
                      handlePhotoFieldChange(photo.path, "songUrl", event.target.value)
                    }
                  />
                  <button
                    className="secondary"
                    onClick={() => handleSavePhotoMetadata(photo.path)}
                    disabled={
                      savingPhotoPath === photo.path || deletingPhotoPath === photo.path
                    }
                  >
                    {savingPhotoPath === photo.path ? "Saving..." : "Save metadata"}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => handleDeletePhoto(photo.path)}
                    disabled={
                      deletingPhotoPath === photo.path || savingPhotoPath === photo.path
                    }
                  >
                    {deletingPhotoPath === photo.path ? "Deleting..." : "Delete photo"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
