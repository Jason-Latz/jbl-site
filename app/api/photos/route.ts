import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireEditor } from "@/lib/requireEditor";

const PHOTO_BUCKET = "photos";
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

function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
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
      failed.push({ name: file.name || `file-${index + 1}`, reason: "Not an image file." });
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
