import { createClient } from "@supabase/supabase-js";
import { cache } from "react";

export type PublicPhoto = {
  name: string;
  path: string;
  url: string;
  alt: string;
  created_at: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PHOTO_BUCKET = "photos";
const IMAGE_NAME_PATTERN = /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i;

const getSupabase = () => {
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
};

function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function deriveAltFromFileName(name: string) {
  const withoutExt = name.replace(/\.[^.]+$/, "");
  return withoutExt
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const fetchPublicPhotos = cache(async () => {
  const supabase = getSupabase();
  if (!supabase || !supabaseUrl) {
    return [] as PublicPhoto[];
  }

  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).list("", {
    limit: 1000,
    offset: 0,
    sortBy: { column: "created_at", order: "desc" }
  });

  if (error || !data) {
    return [] as PublicPhoto[];
  }

  const photos = data
    .filter((entry) => entry.name && IMAGE_NAME_PATTERN.test(entry.name))
    .map((entry) => {
      const path = entry.name;
      return {
        name: entry.name,
        path,
        url: `${supabaseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${encodeStoragePath(
          path
        )}`,
        alt: deriveAltFromFileName(entry.name) || "Photo",
        created_at: entry.created_at ?? null
      };
    });

  return photos as PublicPhoto[];
});
