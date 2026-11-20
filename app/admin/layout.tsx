import type { Metadata } from "next";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/requireEditor";
import StudioNavigation from "./StudioNavigation";
import StudioSignIn from "./StudioSignIn";
import "./studio.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false }
};

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerComponentClient({ cookies }, {
    options: { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } }
  });
  const access = await requireEditor(supabase);
  if (!access.allowed && access.status === 403) redirect("/writings");

  return (
    <div className="studio">
      {access.allowed ? <><StudioNavigation />{children}</> : <StudioSignIn />}
    </div>
  );
}
