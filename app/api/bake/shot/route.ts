import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

// Dev-only sink for canvas screenshots. The /baked viewer renders with
// preserveDrawingBuffer, dumps canvas.toBlob() here, and we read the PNG off
// disk — sidesteps the preview screenshot tool's framing/scale quirks so we
// can judge the baked look at the true canvas resolution. Never in prod.

export const dynamic = "force-dynamic";

const NAME_RE = /^[a-z0-9._-]+\.png$/;

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const name = request.nextUrl.searchParams.get("name") ?? "";
  if (!NAME_RE.test(name)) {
    return NextResponse.json({ error: "name must match [a-z0-9._-]+.png" }, { status: 400 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  const dir = path.join(process.cwd(), "bake", "shots");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, name);
  await writeFile(filePath, body);
  return NextResponse.json({ ok: true, path: filePath, bytes: body.length });
}
