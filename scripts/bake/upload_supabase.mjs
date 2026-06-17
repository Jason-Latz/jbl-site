// Upload the slim baked assets (public/_bake/cdn/**) to a public Supabase
// Storage bucket, under a versioned prefix so URLs are immutable (re-bakes go
// to v2, bump NEXT_PUBLIC_BAKE_CDN_URL, redeploy — no stale-CDN games).
//
// Creates a NEW dedicated "bake" bucket only; never touches other buckets,
// tables, or data. Reads the service-role key from .env and never logs it.
//
// Usage: node scripts/bake/upload_supabase.mjs [version]   (default v1)

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

// minimal .env reader — no dotenv dep; values are used, never printed
function readEnv(file = ".env") {
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const env = readEnv();
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const BUCKET = "bake";
const VERSION = process.argv[2] || "v1";
const ROOT = "public/_bake/cdn";

const supabase = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 1. ensure the public bucket exists (fail fast if creation is blocked)
const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
if (listErr) {
  console.error("listBuckets failed:", listErr.message);
  process.exit(1);
}
if (!buckets.some((b) => b.name === BUCKET)) {
  // No per-bucket fileSizeLimit — inherit the project global max (50MB on the
  // free plan). The GLB is ~28MB, well under it.
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error) {
    console.error("createBucket failed:", error.message);
    process.exit(1);
  }
  console.log(`[upload] created public bucket "${BUCKET}"`);
} else {
  console.log(`[upload] reusing existing bucket "${BUCKET}"`);
}

// 2. walk the slim asset tree
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const contentType = (f) =>
  f.endsWith(".glb") ? "model/gltf-binary" : f.endsWith(".webp") ? "image/webp" : "application/octet-stream";

// 3. upload with a small concurrency pool, immutable cache headers
let done = 0;
let failed = 0;
const queue = [...files];
async function worker() {
  while (queue.length) {
    const f = queue.pop();
    const key = `${VERSION}/${relative(ROOT, f)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(key, readFileSync(f), {
      contentType: contentType(f),
      cacheControl: "31536000",
      upsert: true
    });
    if (error) {
      failed++;
      console.error(`  ✗ ${key}: ${error.message}`);
    } else if (++done % 100 === 0) {
      console.log(`[upload] ${done}/${files.length}`);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

console.log(`[upload] done: ${done} ok, ${failed} failed (of ${files.length})`);
console.log(`[upload] PUBLIC BASE → ${SUPA_URL}/storage/v1/object/public/${BUCKET}/${VERSION}`);
