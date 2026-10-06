import Link from "next/link";
import "./landing.css";
import { Suspense } from "react";
import HomeActivity from "@/components/HomeActivity";
import DeskEntry from "@/components/DeskEntry";
import { formatDate } from "@/lib/date";
import { fetchLatestPublishedPost } from "@/lib/posts";

export const revalidate = 60;

async function LatestWriting() {
  const post = await fetchLatestPublishedPost();
  return post ? (
    <Link className="landing-writing" href={`/writings/${post.slug}`}>
      <span className="landing-writing-label">Latest writing</span>
      <span className="landing-writing-title">{post.title}</span>
      <span className="landing-writing-date">{post.published_at ? formatDate(post.published_at) : "Published"}</span>
    </Link>
  ) : (
    <Link className="landing-writing" href="/writings">
      <span>Writings <span aria-hidden="true">↗</span></span>
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="landing">
      <section className="landing-desk" aria-label="Enter the desk">
        <h1 className="sr-only">Jason Latz</h1>
        {/* A normal HTML link keeps the entire 3D route off the startup path,
            including speculative route/chunk prefetch on hover. */}
        <a className="landing-desk-view" href="/desk" aria-label="Enter the interactive desk">
          <div className="landing-desk-image" role="img" aria-label="Top-down view of Jason's desk with a turntable, laptop, books, chessboard, and notepad" />
        </a>
        <DeskEntry />
      </section>

      <Suspense fallback={
        <Link className="landing-writing" href="/writings">
          <span>Writings <span aria-hidden="true">↗</span></span>
        </Link>
      }><LatestWriting /></Suspense>
      <HomeActivity />
    </div>
  );
}
