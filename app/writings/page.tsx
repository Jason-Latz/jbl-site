import Link from "next/link";
import "./writings.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { formatDate } from "@/lib/date";
import { fetchPublishedPosts } from "@/lib/posts";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Writings",
  description: "From the writing desk: essays, notes, and reflections by Jason Latz."
};

function NotebookMark() {
  return (
    <div className="notebook-mark" aria-hidden="true">
      <div className="notebook-mark-spine" />
      <div className="notebook-mark-page"><span>notes &amp;<br /><em>other things</em></span><i /><i /><i /></div>
      <div className="notebook-mark-pen" />
    </div>
  );
}

async function WritingArchive() {
  const posts = await fetchPublishedPosts();
  const [latest, ...earlier] = posts;

  if (!latest) {
    return <div className="writing-empty"><h2>A fresh page.</h2><p>Nothing published here yet. Come back soon.</p></div>;
  }

  return (
    <>
      <Link className="writing-feature" href={`/writings/${latest.slug}`}>
        <span className="eyebrow">The latest entry</span>
        <h2>{latest.title}</h2>
        {latest.excerpt ? <p>{latest.excerpt}</p> : null}
        <span className="writing-feature-foot">
          <span>{latest.published_at ? formatDate(latest.published_at) : "Published"}</span>
          <span>Read the piece <span aria-hidden="true">↗</span></span>
        </span>
      </Link>
      <div className="notebook-index-head"><h2>{earlier.length ? "The rest of the notebook" : "The notebook"}</h2><span>{posts.length} {posts.length === 1 ? "entry" : "entries"}</span></div>
      {earlier.length ? (
        <ol className="notebook-index">
          {earlier.map((post, index) => (
            <li key={post.id}>
              <Link className="notebook-entry" href={`/writings/${post.slug}`}>
                <span className="notebook-entry-number" aria-hidden="true">{String(index + 2).padStart(2, "0")}</span>
                <div><h3>{post.title}</h3>{post.excerpt ? <p>{post.excerpt}</p> : null}<span className="essay-date">{post.published_at ? formatDate(post.published_at) : "Published"}</span></div>
                <span className="notebook-entry-arrow" aria-hidden="true">↗</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : <p className="post-meta">More pages to come.</p>}
    </>
  );
}

export default function WritingsPage() {
  return (
    <section className="writing-room" aria-labelledby="writings-title">
      <header className="writing-room-header">
        <div><p className="eyebrow">Writings / Jason Latz</p><h1 id="writings-title">From the <em>desk.</em></h1><p>Essays, notes, and thoughts that made it off the scratch pad.</p></div>
        <NotebookMark />
      </header>
      <div className="writing-room-layout">
        <div className="writing-room-pages">
          <Suspense fallback={<div className="writing-empty" aria-busy="true"><p>Opening the notebook…</p></div>}><WritingArchive /></Suspense>
        </div>
        <aside className="writing-room-margin" aria-label="Around the desk">
          <p className="eyebrow">In the same room</p>
          <a className="margin-book" href="/desk?focus=reading"><span aria-hidden="true" className="margin-book-spines"><i /><i /><i /></span><strong>The bookshelf <span aria-hidden="true">↗</span></strong><p>What I&rsquo;m reading, and what stays with me.</p></a>
          <a className="margin-pad" href="/desk?focus=notes"><strong>The scratch pad <span aria-hidden="true">↗</span></strong><p>A guestbook. Leave a little something of your own.</p></a>
          <Link className="writing-home-link" href="/">← Back to the front door</Link>
        </aside>
      </div>
    </section>
  );
}
