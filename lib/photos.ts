import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

export const PHOTO_BUCKET = "photos";

export type PhotoCatalogItem = {
  id: string | null;
  path: string;
  url: string;
  alt: string;
  location: string | null;
  description: string | null;
  songTitle: string | null;
  songUrl: string | null;
  createdAt: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const IMAGE_NAME_PATTERN = /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i;
const MAX_PHOTO_CATALOG_ITEMS = 1000;

type ListedPhotoObject = {
  name: string;
  createdAt: string | null;
};

type PublicPhotoUrlItem = {
  path: string;
  url: string;
};

let cachedPublicSupabaseClient: SupabaseClient | null | undefined;

const getSupabase = () => {
  if (cachedPublicSupabaseClient !== undefined) {
    return cachedPublicSupabaseClient;
  }

  if (!supabaseUrl || !supabaseKey) {
    cachedPublicSupabaseClient = null;
    return cachedPublicSupabaseClient;
  }

  cachedPublicSupabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  return cachedPublicSupabaseClient;
};

export function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

type PublicRenderOptions = {
  width: number;
  quality?: number;
  resize?: "cover" | "contain" | "fill";
};

export function buildPublicRenderUrl(
  originalUrl: string,
  options: PublicRenderOptions
) {
  const width = Math.max(1, Math.round(options.width));
  const quality =
    typeof options.quality === "number"
      ? Math.min(100, Math.max(1, Math.round(options.quality)))
      : null;

  let url: URL;
  try {
    url = new URL(originalUrl);
  } catch {
    return originalUrl;
  }

  url.pathname = url.pathname.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/"
  );
  url.searchParams.set("width", String(width));
  url.searchParams.set("resize", options.resize ?? "contain");
  if (quality !== null) {
    url.searchParams.set("quality", String(quality));
  }

  return url.toString();
}

function deriveAltFromFileName(name: string) {
  const withoutExt = name.replace(/\.[^.]+$/, "");
  return withoutExt
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type MetadataRow = {
  id: string;
  storage_path: string;
  location: string | null;
  description: string | null;
  song_title: string | null;
  song_url: string | null;
  created_at: string | null;
};

function normalizeStorageListLimit(limit: number) {
  if (!Number.isFinite(limit)) {
    return MAX_PHOTO_CATALOG_ITEMS;
  }

  const bounded = Math.floor(limit);
  return Math.min(MAX_PHOTO_CATALOG_ITEMS, Math.max(1, bounded));
}

function buildPublicPhotoUrl(baseUrl: string, path: string) {
  return `${baseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${encodeStoragePath(
    path
  )}`;
}

async function listRecentPhotoObjects(
  supabase: SupabaseClient,
  limit: number
) {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).list("", {
    limit: normalizeStorageListLimit(limit),
    offset: 0,
    sortBy: { column: "created_at", order: "desc" }
  });

  if (error || !data) {
    return [] as ListedPhotoObject[];
  }

  return data.flatMap((entry) => {
    if (
      typeof entry.name !== "string" ||
      !IMAGE_NAME_PATTERN.test(entry.name)
    ) {
      return [];
    }

    return [
      {
        name: entry.name,
        createdAt: entry.created_at ?? null
      }
    ];
  });
}

export async function listPhotoCatalog(
  supabase: SupabaseClient,
  baseUrl: string | undefined
) {
  if (!baseUrl) {
    return [] as PhotoCatalogItem[];
  }

  const imageObjects = await listRecentPhotoObjects(
    supabase,
    MAX_PHOTO_CATALOG_ITEMS
  );

  const paths = imageObjects.map((entry) => entry.name);
  const metadataByPath = new Map<string, MetadataRow>();

  if (paths.length > 0) {
    const { data: metadataRows } = await supabase
      .from("photos")
      .select(
        "id, storage_path, location, description, song_title, song_url, created_at"
      )
      .in("storage_path", paths);

    for (const row of (metadataRows ?? []) as MetadataRow[]) {
      metadataByPath.set(row.storage_path, row);
    }
  }

  const photos = imageObjects.map((entry) => {
    const path = entry.name;
    const metadata = metadataByPath.get(path);

    return {
      id: metadata?.id ?? null,
      path,
      url: buildPublicPhotoUrl(baseUrl, path),
      alt: deriveAltFromFileName(entry.name) || "Photo",
      location: normalizeText(metadata?.location),
      description: normalizeText(metadata?.description),
      songTitle: normalizeText(metadata?.song_title),
      songUrl: normalizeText(metadata?.song_url),
      createdAt: metadata?.created_at ?? entry.createdAt ?? null
    };
  });

  return photos as PhotoCatalogItem[];
}

export async function listRecentPublicPhotoUrls(
  supabase: SupabaseClient,
  baseUrl: string | undefined,
  limit: number
) {
  if (!baseUrl) {
    return [] as PublicPhotoUrlItem[];
  }

  const imageObjects = await listRecentPhotoObjects(supabase, limit);

  return imageObjects.map((entry) => ({
    path: entry.name,
    url: buildPublicPhotoUrl(baseUrl, entry.name)
  }));
}

export const fetchPublicPhotos = cache(async () => {
  const supabase = getSupabase();
  if (!supabase || !supabaseUrl) {
    return [] as PhotoCatalogItem[];
  }

  return listPhotoCatalog(supabase, supabaseUrl);
});

export const fetchRecentPublicPhotoUrls = cache(async (limit: number) => {
  const supabase = getSupabase();
  if (!supabase || !supabaseUrl) {
    return [] as PublicPhotoUrlItem[];
  }

  return listRecentPublicPhotoUrls(supabase, supabaseUrl, limit);
});
