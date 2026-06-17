import AdminEditor from "./AdminEditor";
import ChessAdmin from "./ChessAdmin";
import ChessTurnBanner from "./ChessTurnBanner";
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
    <>
      {/* Pinned to the top so a pending world move is the first thing Jason
          sees on /admin — links down to the board below the editor. */}
      <ChessTurnBanner />
      <section className="section">
        <h1>Content admin</h1>
        <p className="post-meta">
          Create and publish articles, then upload travel photos for the mosaic page.
        </p>
        <AdminEditor />
      </section>
      <section className="section" id="chessboard">
        <h2>The chessboard</h2>
        <p className="post-meta">
          One global game — the world vs. Jason. This is your side of the table.
        </p>
        <ChessAdmin />
      </section>
    </>
  );
}
