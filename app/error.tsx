"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="section not-found-page">
      <header className="page-header">
        <p className="eyebrow">Something slipped</p>
        <h1>The page hit a snag.</h1>
        <p className="standfirst">
          Nothing you did caused it. Try the page once more, or head back to a
          known spot.
        </p>
      </header>
      <div className="page-recovery-actions">
        <button type="button" className="primary" onClick={reset}>
          Try again
        </button>
        <Link className="secondary" href="/">
          Back home
        </Link>
      </div>
    </section>
  );
}
