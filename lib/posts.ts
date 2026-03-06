import { createClient } from "@supabase/supabase-js";

export type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const getSupabase = () => {
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
};

export async function fetchPublishedPosts() {
  const supabase = getSupabase();
  if (!supabase) {
    return [] as Post[];
  }

  const { data } = await supabase
    .from("posts")
    .select(
      "id, title, slug, excerpt, published, published_at, created_at, updated_at"
    )
    .eq("published", true)
    .order("published_at", { ascending: false });

  return (data ?? []) as Post[];
}

export async function fetchPostBySlug(slug: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("posts")
    .select(
      "id, title, slug, excerpt, content, published, published_at, created_at, updated_at"
    )
    .eq("slug", slug)
    .eq("published", true)
    .single();

  return (data as Post | null) ?? null;
}
