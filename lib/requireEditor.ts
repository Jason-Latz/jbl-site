import type { SupabaseClient } from "@supabase/supabase-js";

type EditorCheck =
  | { allowed: true; userId: string }
  | { allowed: false; status: number; message: string };

export async function requireEditor(
  supabase: SupabaseClient
): Promise<EditorCheck> {
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { allowed: false, status: 401, message: "Unauthorized" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_editor")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.is_editor) {
    return { allowed: false, status: 403, message: "Forbidden" };
  }

  return { allowed: true, userId: user.id };
}
