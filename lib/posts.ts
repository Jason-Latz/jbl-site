import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export type PostSummary = Omit<Post, "content">;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let cachedSupabase: SupabaseClient | null | undefined;

const POST_SUMMARY_SELECT =
  "id, title, slug, excerpt, published, published_at, created_at, updated_at";
const POST_DETAIL_SELECT = `${POST_SUMMARY_SELECT}, content`;

const getSupabase = () => {
  if (cachedSupabase !== undefined) {
    return cachedSupabase;
  }

  if (!supabaseUrl || !supabaseKey) {
    cachedSupabase = null;
    return cachedSupabase;
  }

  cachedSupabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
  return cachedSupabase;
};

export async function fetchPublishedPosts() {
  const supabase = getSupabase();
  if (!supabase) {
    return [] as PostSummary[];
  }

  const { data } = await supabase
    .from("posts")
    .select(POST_SUMMARY_SELECT)
    .eq("published", true)
    .order("published_at", { ascending: false });

  return (data ?? []) as PostSummary[];
}

export async function fetchLatestPublishedPost() {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("posts")
    .select(POST_SUMMARY_SELECT)
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as PostSummary | null) ?? null;
}

export async function fetchPostBySlug(slug: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("posts")
    .select(POST_DETAIL_SELECT)
    .eq("slug", slug)
    .eq("published", true)
    .single();

  return (data as Post | null) ?? null;
}
