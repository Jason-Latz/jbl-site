"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { PLACES } from "@/content/places";
import { buildTravelRenderUrlForRequestWidth, UPLOAD_WARM_WIDTHS } from "@/lib/travel-image";

type Photo = {
  path: string;
  url: string | null;
  location: string | null;
  description: string | null;
  songTitle: string | null;
  songUrl: string | null;
  geoPlace?: string | null;
  geoSource?: string | null;
};

type PhotoFields = Record<"location" | "description" | "songTitle" | "songUrl" | "geoPlace", string>;

function fieldsFor(photo: Photo): PhotoFields {
  return {
    location: photo.location ?? "",
    description: photo.description ?? "",
    songTitle: photo.songTitle ?? "",
    songUrl: photo.songUrl ?? "",
    geoPlace: photo.geoPlace ?? ""
  };
}

function displayName(photo: Photo) {
  return photo.location || photo.geoPlace || photo.path.replace(/^\d+-\d+-[\da-f-]{36}-/i, "");
}

async function warmUploads(uploads: Photo[], stopped: () => boolean) {
  const urls = uploads.flatMap(({ url }) =>
    url ? UPLOAD_WARM_WIDTHS.map((width) => buildTravelRenderUrlForRequestWidth(url, width)) : []
  );
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, urls.length) }, async () => {
    while (next < urls.length && !stopped()) {
      const url = urls[next++];
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = image.onerror = () => resolve();
        image.src = url;
      });
    }
  }));
}

export default function PhotoStudio() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [activePath, setActivePath] = useState("");
  const [edits, setEdits] = useState<Record<string, PhotoFields>>({});
  const [count, setCount] = useState(0);
  const [operation, setOperation] = useState<"upload" | "save" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const warmingGeneration = useRef(0);
  const busy = useRef(false);
  const active = photos?.find(({ path }) => path === activePath);
  const fields = active && (edits[active.path] ?? fieldsFor(active));

  const readResponse = useCallback(async (response: Response) => {
    if (response.status === 401) router.refresh();
    if (response.status === 403) router.replace("/writings");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `Photo request failed (${response.status}).`);
    return data;
  }, [router]);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await readResponse(await fetch("/api/travel", { cache: "no-store", signal }));
      const next: Photo[] = data.photos;
      setPhotos(next);
      setActivePath((current) => next.some(({ path }) => path === current) ? current : next[0]?.path ?? "");
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "Couldn’t load photos.");
    }
  }, [readResponse]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
      warmingGeneration.current += 1;
    };
  }, [load]);

  function edit(field: keyof PhotoFields, value: string) {
    if (!active) return;
    setEdits((current) => ({
      ...current,
      [active.path]: { ...(current[active.path] ?? fieldsFor(active)), [field]: value }
    }));
  }

  async function run(kind: Exclude<typeof operation, null>, action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setOperation(kind);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo operation failed.");
    } finally {
      busy.current = false;
      setOperation(null);
    }
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = Array.from(uploadRef.current?.files ?? []);
    if (!files.length) return;
    void run("upload", async () => {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      const data = await readResponse(await fetch("/api/travel", { method: "POST", body }));
      const succeeded = data.uploadedCount ?? 0;
      const failed = (data.failed ?? []).map(
        ({ name, reason }: { name: string; reason: string }) => `${name}: ${reason}`
      );
      setMessage(`Uploaded ${succeeded} ${succeeded === 1 ? "photo" : "photos"}.`);
      if (failed.length) setError(failed.join(" · "));
      setCount(0);
      if (uploadRef.current) uploadRef.current.value = "";
      await load();
      if (data.uploaded?.length) {
        const generation = ++warmingGeneration.current;
        void warmUploads(data.uploaded, () => generation !== warmingGeneration.current);
      }
    });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !fields) return;
    const { geoPlace, ...metadata } = fields;
    const locationUpdate = geoPlace !== (active.geoPlace ?? "") ? { geoPlace } : {};
    void run("save", async () => {
      const data = await readResponse(await fetch("/api/travel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: active.path, ...metadata, ...locationUpdate })
      }));
      setPhotos((current) => current?.map((photo) => photo.path === active.path ? data.photo : photo) ?? null);
      setEdits(({ [active.path]: _saved, ...remaining }) => remaining);
      setMessage("Photo details saved.");
    });
  }

  function remove() {
    if (!active || busy.current || !window.confirm("Permanently delete this photo and its details from the gallery?")) return;
    void run("delete", async () => {
      await readResponse(await fetch("/api/travel", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: active.path })
      }));
      setEdits(({ [active.path]: _deleted, ...remaining }) => remaining);
      const remaining = photos?.filter(({ path }) => path !== active.path) ?? [];
      setPhotos(remaining);
      setActivePath((current) => current === active.path ? remaining[0]?.path ?? "" : current);
      setMessage("Photo deleted.");
    });
  }

  return (
    <section>
      <div className="studio-heading"><h1>Photos</h1><a href="/photography">View gallery ↗</a></div>
      <form className="studio-upload" onSubmit={upload}>
        <label className="form-field">Choose photos
          <input ref={uploadRef} type="file" accept="image/*,.heic,.heif" multiple disabled={operation !== null}
            onChange={(event) => setCount(event.currentTarget.files?.length ?? 0)} />
        </label>
        <button className="primary" type="submit" disabled={!count || operation !== null}>
          {operation === "upload" ? "Uploading…" : count ? `Upload ${count} ${count === 1 ? "photo" : "photos"}` : "Upload"}
        </button>
      </form>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error} {photos === null ? <button className="secondary" onClick={() => { setError(""); void load(); }}>Try again</button> : null}</p> : null}
      {!photos && !error ? <p role="status">Loading photos…</p> : null}
      {photos?.length === 0 ? <p className="studio-muted">No photos uploaded yet.</p> : null}
      {photos?.length && active && fields ? (
        <div className="studio-photos">
          <ul className="studio-photo-list">
            {photos.map((photo) => (
              <li key={photo.path}>
                <button type="button" aria-pressed={photo.path === active.path} onClick={() => setActivePath(photo.path)}>
                  {photo.url ? (
                    <img src={buildTravelRenderUrlForRequestWidth(photo.url, 320)} alt="" loading="lazy" decoding="async"
                      onError={(event) => {
                        if (photo.url && event.currentTarget.src !== photo.url) event.currentTarget.src = photo.url;
                      }} />
                  ) : null}
                  <span>{displayName(photo)}{edits[photo.path] ? " · Unsaved" : ""}</span>
                </button>
              </li>
            ))}
          </ul>
          <form className="studio-photo-details" onSubmit={save}>
            <h2>Photo details</h2>
            {active.url ? (
              <img key={active.path} className="studio-photo-preview"
                src={buildTravelRenderUrlForRequestWidth(active.url, 720)}
                alt={active.description || displayName(active)} decoding="async"
                onError={(event) => {
                  if (active.url && event.currentTarget.src !== active.url) event.currentTarget.src = active.url;
                }}
              />
            ) : null}
            <fieldset disabled={operation !== null}>
              <label className="form-field">Display location<input value={fields.location} onChange={(event) => edit("location", event.target.value)} /></label>
              <label className="form-field">Description<textarea rows={3} value={fields.description} onChange={(event) => edit("description", event.target.value)} /></label>
              <label className="form-field">Globe pin
                <select value={fields.geoPlace} aria-describedby={active.geoSource ? "studio-pin-source" : undefined}
                  onChange={(event) => edit("geoPlace", event.target.value)}>
                  <option value="">No pin</option>
                  {fields.geoPlace && !PLACES.some(({ name }) => name === fields.geoPlace) ? <option value={fields.geoPlace}>{fields.geoPlace}</option> : null}
                  {PLACES.map((place) => <option key={place.name} value={place.name}>{place.name}</option>)}
                </select>
              </label>
              {active.geoSource ? <small className="studio-muted" id="studio-pin-source">{active.geoSource === "manual" ? "Manual placement" : active.geoSource === "exif" ? "Photo GPS" : "Estimated placement"}</small> : null}
              <details className="studio-settings">
                <summary>Soundtrack</summary>
                <label className="form-field">Song title<input value={fields.songTitle} onChange={(event) => edit("songTitle", event.target.value)} /></label>
                <label className="form-field">Spotify link<input type="url" value={fields.songUrl} onChange={(event) => edit("songUrl", event.target.value)} /></label>
              </details>
              <div className="studio-actions">
                <button className="primary" type="submit" disabled={!edits[active.path]}>{operation === "save" ? "Saving…" : "Save details"}</button>
                {active.url ? <a href={active.url} target="_blank" rel="noreferrer">View original ↗</a> : null}
                <button className="studio-danger" type="button" onClick={remove}>Delete photo</button>
              </div>
            </fieldset>
          </form>
        </div>
      ) : null}
    </section>
  );
}
