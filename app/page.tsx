import Link from "next/link";
import "./landing.css";
import { Suspense } from "react";
import HomeActivity from "@/components/HomeActivity";
import { formatDate } from "@/lib/date";
import { fetchLatestPublishedPost } from "@/lib/posts";

export const revalidate = 60;

async function LatestWriting() {
  const post = await fetchLatestPublishedPost();
  return post ? (
    <Link className="landing-writing" href={`/writings/${post.slug}`}>
      <span className="eyebrow">Fresh off the desk</span>
      <h2>{post.title}</h2>
      {post.excerpt ? <p>{post.excerpt}</p> : null}
      <span className="landing-writing-foot">
        <span>{post.published_at ? formatDate(post.published_at) : "Published"}</span>
        <span>Read the piece <span aria-hidden="true">↗</span></span>
      </span>
    </Link>
  ) : (
    <Link className="landing-writing" href="/writings">
      <span className="eyebrow">From the desk</span>
      <h2>Essays, notes, and things worth keeping.</h2>
      <p>A place for the longer thoughts.</p>
      <span className="landing-writing-foot">Open the notebook ↗</span>
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="landing">
      <section className="landing-intro" aria-labelledby="intro-title">
        <div className="landing-copy">
          <p className="eyebrow">A small corner of the internet</p>
          <h1 id="intro-title">Out and about,<br />occasionally<br /><em>building things.</em></h1>
          <p className="landing-standfirst">
            I&rsquo;m Jason. I like building things, travelling, and writing
            about what I find along the way.
          </p>
          <Link className="landing-text-link" href="/writings">Read my writing <span aria-hidden="true">↗</span></Link>
        </div>

        {/* A normal HTML link keeps the entire 3D route off the startup path,
            including speculative route/chunk prefetch on hover. */}
        <a className="desk-postcard" href="/desk">
          <div className="desk-postcard-image" role="img" aria-label="A wooden desk with books, a turntable, and a scratch pad" />
          <div className="desk-postcard-caption">
            <div><span className="eyebrow">Make yourself at home</span><strong>Enter the desk</strong></div>
            <span className="desk-postcard-arrow" aria-hidden="true">↗</span>
          </div>
          <span className="desk-postcard-note">A little room to look around.</span>
        </a>
      </section>

      <nav className="landing-directory" aria-label="Explore the site">
        <Link href="/writings"><span className="directory-number" aria-hidden="true">01</span><span><strong>Writings</strong><small>Open the notebook</small></span><span aria-hidden="true">↗</span></Link>
        <a href="/photography"><span className="directory-number" aria-hidden="true">02</span><span><strong>Photography</strong><small>Through the lens</small></span><span aria-hidden="true">↗</span></a>
        <a href="/travel"><span className="directory-number" aria-hidden="true">03</span><span><strong>Travel</strong><small>Places along the way</small></span><span aria-hidden="true">↗</span></a>
        <Link href="/experience"><span className="directory-number" aria-hidden="true">04</span><span><strong>Experience</strong><small>What I&rsquo;ve been up to</small></span><span aria-hidden="true">↗</span></Link>
      </nav>

      <Suspense fallback={
        <Link className="landing-writing" href="/writings">
          <span className="eyebrow">From the desk</span>
          <h2>Essays, notes, and things worth keeping.</h2>
          <p>A place for the longer thoughts.</p>
          <span className="landing-writing-foot">Open the notebook ↗</span>
        </Link>
      }><LatestWriting /></Suspense>
      <HomeActivity />
    </div>
  );
}
