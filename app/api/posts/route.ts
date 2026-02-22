import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireEditor } from "@/lib/requireEditor";

export async function GET() {
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
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ posts: data ?? [] });
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

  const payload = await request.json();
  const title = payload?.title?.trim();
  const slug = payload?.slug?.trim();

  if (!title || !slug) {
    return NextResponse.json(
      { error: "Title and slug are required." },
      { status: 400 }
    );
  }

  const published = Boolean(payload?.published);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("posts")
    .insert({
      title,
      slug,
      excerpt: payload?.excerpt ?? null,
      content: payload?.content ?? null,
      published,
      published_at: published ? now : null
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ post: data });
}
