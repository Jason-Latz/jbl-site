import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { resolvePublishedAt } from "@/lib/publishedAt";
import { requireEditor } from "@/lib/requireEditor";
import { createFreshRouteHandlerClient } from "@/lib/supabaseRoute";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createFreshRouteHandlerClient();
  const access = await requireEditor(supabase);

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  }

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, title, slug, excerpt, content, published, published_at, created_at, updated_at"
    )
    .eq("id", params.id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ post: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createFreshRouteHandlerClient();
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

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";

  if (!title || !slug) {
    return NextResponse.json(
      { error: "Title and slug are required." },
      { status: 400 }
    );
  }

  if (!SLUG_PATTERN.test(slug)) {
    return NextResponse.json(
      {
        error:
          "Slug must use lowercase letters, numbers, and single hyphens only."
      },
      { status: 400 }
    );
  }

  const { data: existingPost, error: existingPostError } = await supabase
    .from("posts")
    .select("slug, published_at, updated_at")
    .eq("id", params.id)
    .single();

  if (existingPostError) {
    if (existingPostError.code === "PGRST116") {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    return NextResponse.json(
      { error: existingPostError.message },
      { status: 500 }
    );
  }

  const published = Boolean(payload.published);
  const now = new Date().toISOString();
  const excerpt =
    typeof payload.excerpt === "string" ? payload.excerpt.trim() || null : null;
  const content = typeof payload.content === "string" ? payload.content : null;

  const hasExpectedVersion = Object.hasOwn(payload, "expectedUpdatedAt");
  const expected = payload.expectedUpdatedAt;
  if (hasExpectedVersion && expected !== null && typeof expected !== "string") {
    return NextResponse.json({ error: "Invalid article version." }, { status: 400 });
  }
  const conflict = () => NextResponse.json({
    error: "This article changed in another tab. Copy your edits before reopening it."
  }, { status: 409 });
  if (hasExpectedVersion && expected !== existingPost.updated_at) return conflict();

  let update = supabase
    .from("posts")
    .update({
      title,
      slug,
      excerpt,
      content,
      published,
      published_at: resolvePublishedAt(published, existingPost.published_at, now)
    })
    .eq("id", params.id);
  if (hasExpectedVersion) {
    update = expected === null ? update.is("updated_at", null) : update.eq("updated_at", expected);
  }
  const { data, error } = await update.select().maybeSingle();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A post with this slug already exists." },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    if (hasExpectedVersion) return conflict();
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  revalidatePath("/");
  revalidatePath("/writings");
  revalidatePath(`/writings/${existingPost.slug}`);
  if (existingPost.slug !== data.slug) {
    revalidatePath(`/writings/${data.slug}`);
  }

  return NextResponse.json({ post: data });
}
