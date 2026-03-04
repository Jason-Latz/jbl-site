import AdminEditor from "./AdminEditor";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("is_editor")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !profile?.is_editor) {
      redirect("/writings");
    }
  }

  return (
    <section className="section">
      <h1>Editor</h1>
      <p className="post-meta">
        Sign in to draft, edit, and publish your writing.
      </p>
      <AdminEditor />
    </section>
  );
}
