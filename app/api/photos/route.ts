import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PHOTO_BUCKET,
  encodeStoragePath,
  listPhotoCatalog
} from "@/lib/photos";
import { requireEditor } from "@/lib/requireEditor";

const MAX_FILES_PER_REQUEST = 40;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function normalizeFileName(name: string) {
  const withoutExt = name.replace(/\.[^.]+$/, "");
  const cleanBase = withoutExt
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleanBase || "photo";
}

function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extensionFromFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const extensionMatch = lowerName.match(/(\.[a-z0-9]+)$/);

  if (extensionMatch) {
    return extensionMatch[1];
  }

  switch (file.type) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/avif":
      return ".avif";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    default:
      return "";
  }
}

function validateSpotifyUrl(value: string | null) {
  if (!value) {
    return { valid: true as const, url: null };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { valid: false as const, error: "Song URL must be a valid URL." };
  }

  const host = parsed.hostname.toLowerCase();
  const isSpotifyHost = host === "open.spotify.com" || host === "spotify.link";

  if (!isSpotifyHost) {
    return {
      valid: false as const,
      error: "Song URL must be a Spotify link (open.spotify.com or spotify.link)."
    };
  }

  return { valid: true as const, url: parsed.toString() };
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const access = await requireEditor(supabase);

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  }

  const photos = await listPhotoCatalog(
    supabase,
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );

  return NextResponse.json({ photos });
}

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const access = await requireEditor(supabase);

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data." },
      { status: 400 }
    );
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "Please select at least one image." },
      { status: 400 }
    );
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `You can upload up to ${MAX_FILES_PER_REQUEST} files per batch.` },
      { status: 400 }
    );
  }

  const uploadedPaths: string[] = [];
  const failed: { name: string; reason: string }[] = [];
  const uploadGroupId = Date.now();

  for (const [index, file] of files.entries()) {
    if (!file.type.startsWith("image/")) {
      failed.push({
        name: file.name || `file-${index + 1}`,
        reason: "Not an image file."
      });
      continue;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      failed.push({
        name: file.name || `file-${index + 1}`,
        reason: "File exceeds 25MB limit."
      });
      continue;
    }

    const extension = extensionFromFile(file);
    const safeName = normalizeFileName(file.name);
    const objectPath = `${uploadGroupId}-${index + 1}-${crypto.randomUUID()}-${safeName}${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(objectPath, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type || undefined
      });

    if (uploadError) {
      failed.push({
        name: file.name || `file-${index + 1}`,
        reason: uploadError.message
      });
      continue;
    }

    const { error: metadataError } = await supabase.from("photos").upsert(
      {
        storage_path: objectPath
      },
      {
        onConflict: "storage_path"
      }
    );

    if (metadataError) {
      await supabase.storage.from(PHOTO_BUCKET).remove([objectPath]);
      failed.push({
        name: file.name || `file-${index + 1}`,
        reason: `Uploaded image metadata failed: ${metadataError.message}`
      });
      continue;
    }

    uploadedPaths.push(objectPath);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const uploaded = uploadedPaths.map((path) => ({
    path,
    url: baseUrl
      ? `${baseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${encodeStoragePath(
          path
        )}`
      : null
  }));

  const status = uploaded.length === 0 ? 400 : 200;

  return NextResponse.json(
    {
      uploaded,
      uploadedCount: uploaded.length,
      failedCount: failed.length,
      failed
    },
    { status }
  );
}

export async function PATCH(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const access = await requireEditor(supabase);

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const storagePath =
    typeof payload.storagePath === "string" ? payload.storagePath.trim() : "";

  if (!storagePath) {
    return NextResponse.json(
      { error: "storagePath is required." },
      { status: 400 }
    );
  }

  const location = normalizeNullableText(payload.location);
  const description = normalizeNullableText(payload.description);
  const songTitle = normalizeNullableText(payload.songTitle);
  const songUrlInput = normalizeNullableText(payload.songUrl);

  const spotifyValidation = validateSpotifyUrl(songUrlInput);
  if (!spotifyValidation.valid) {
    return NextResponse.json({ error: spotifyValidation.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("photos")
    .upsert(
      {
        storage_path: storagePath,
        location,
        description,
        song_title: songTitle,
        song_url: spotifyValidation.url
      },
      { onConflict: "storage_path" }
    )
    .select(
      "id, storage_path, location, description, song_title, song_url, created_at"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  return NextResponse.json({
    photo: {
      id: data.id,
      path: data.storage_path,
      url: baseUrl
        ? `${baseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${encodeStoragePath(
            data.storage_path
          )}`
        : null,
      location: normalizeNullableText(data.location),
      description: normalizeNullableText(data.description),
      songTitle: normalizeNullableText(data.song_title),
      songUrl: normalizeNullableText(data.song_url),
      createdAt: data.created_at
    }
  });
}
