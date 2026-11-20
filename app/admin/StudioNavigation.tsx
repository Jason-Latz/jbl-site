"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const sections = [
  { title: "Writing", href: "/admin" },
  { title: "Photos", href: "/admin/photos" },
  { title: "Chess", href: "/admin/chess" }
];

export default function StudioNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const area = pathname === "/admin/photos" || pathname === "/admin/chess" ? pathname : "/admin";

  async function signOut() {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await createClientComponentClient().auth.signOut();
      if (error) throw error;
      router.replace("/admin");
      router.refresh();
    } catch {
      setMessage("Couldn’t sign out. Try again.");
      setBusy(false);
    }
  }

  return (
    <header className="studio-bar">
      <nav aria-label="Studio">
        {sections.map(({ title, href }) => (
          <Link key={href} href={href} prefetch={false} aria-current={area === href ? "page" : undefined}>{title}</Link>
        ))}
      </nav>
      <button type="button" className="secondary" aria-busy={busy} onClick={signOut} disabled={busy}>Sign out</button>
      {message ? <p role="alert">{message}</p> : null}
    </header>
  );
}
