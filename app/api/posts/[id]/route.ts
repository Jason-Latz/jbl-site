import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireEditor } from "@/lib/requireEditor";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
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

  const published = Boolean(payload.published);
  const now = new Date().toISOString();
  const excerpt =
    typeof payload.excerpt === "string" ? payload.excerpt.trim() || null : null;
  const content = typeof payload.content === "string" ? payload.content : null;

  const { data, error } = await supabase
    .from("posts")
    .update({
      title,
      slug,
      excerpt,
      content,
      published,
      published_at: published ? now : null
    })
    .eq("id", params.id)
    .select()
    .single();

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

  return NextResponse.json({ post: data });
}
