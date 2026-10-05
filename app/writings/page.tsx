import Link from "next/link";
import "./writings.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { formatDate } from "@/lib/date";
import { fetchPublishedPosts } from "@/lib/posts";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Writings",
  description: "Essays and notes by Jason Latz."
};

async function WritingArchive() {
  const posts = await fetchPublishedPosts();

  if (!posts.length) {
    return <p className="writing-empty">No published writings yet.</p>;
  }

  return (
    <ul className="writing-list">
      {posts.map((post) => (
        <li key={post.id}>
          <Link className="writing-entry" href={`/writings/${post.slug}`}>
            <h2>{post.title}</h2>
            {post.published_at ? (
              <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function WritingsPage() {
  return (
    <section className="writings" aria-labelledby="writings-title">
      <h1 id="writings-title">Writings</h1>
      <Suspense fallback={<p className="writing-empty" role="status">Loading writings…</p>}>
        <WritingArchive />
      </Suspense>
    </section>
  );
}
