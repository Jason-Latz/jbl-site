import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PostEditorPage from "../PostEditorPage";

export const dynamic = "force-dynamic";

async function guardEditorRoute() {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_editor")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile?.is_editor) {
    redirect("/writings");
  }
}

export default async function EditArticlePage({
  params
}: {
  params: { id: string };
}) {
  await guardEditorRoute();

  return (
    <section className="section">
      <h1>Edit article</h1>
      <p className="post-meta">Update Markdown and preview before publishing.</p>
      <PostEditorPage postId={params.id} />
    </section>
  );
}
