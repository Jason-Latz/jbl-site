import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

// Dev-only sink for the bake pipeline: the /bake page exports the desk scene
// as a binary GLB in the browser (where the procedural geometry and canvas
// textures actually live) and POSTs it here to land on disk for Blender.
// Never available in production — the kiln is a build tool, not a feature.

export const dynamic = "force-dynamic";

const NAME_RE = /^[a-z0-9._-]+\.glb$/;

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const name = request.nextUrl.searchParams.get("name") ?? "";
  if (!NAME_RE.test(name)) {
    return NextResponse.json(
      { error: "name must match [a-z0-9._-]+.glb" },
      { status: 400 }
    );
  }

  const body = Buffer.from(await request.arrayBuffer());
  if (body.length < 1024) {
    return NextResponse.json({ error: "suspiciously small GLB" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "bake");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, name);
  await writeFile(filePath, body);

  return NextResponse.json({ ok: true, path: filePath, bytes: body.length });
}
