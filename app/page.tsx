import Link from "next/link";
import { Suspense } from "react";
import HomeActivity from "@/components/HomeActivity";
import DeskEntry from "@/components/DeskEntry";
import { formatDate } from "@/lib/date";
import { fetchPublishedPosts } from "@/lib/posts";
import "./landing.css";

export const revalidate = 60;

const selectedSlugs = ["losing-my-voice", "draft-mvyft7sg-39zyx", "draft-mmcg67vg-3r55u"];

async function SelectedWriting() {
  const posts = await fetchPublishedPosts();
  const selected = selectedSlugs.flatMap((slug) => posts.filter((post) => post.slug === slug));
  const others = posts.filter((post) => !selectedSlugs.includes(post.slug));
  const shown = [...selected, ...others].slice(0, selectedSlugs.length);

  if (shown.length === 0) return <Link href="/writings">All writings →</Link>;

  return (
    <ul className="landing-essays">
      {shown.map((post) => (
        <li key={post.id}>
          <Link href={`/writings/${post.slug}`} prefetch={false}>{post.title}</Link>
          {post.slug === selectedSlugs[0] ? <span className="landing-recommended">Start here</span> : null}
          {post.published_at ? <time dateTime={post.published_at}>{formatDate(post.published_at)}</time> : null}
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  return (
    <div className="landing">
      <section className="landing-desktop" aria-label="Jason's desk">
        <div className="landing-desk">
          <div
            className="landing-illustration"
            role="img"
            aria-label="Jason’s desk with a record player, a chessboard and his photographs from Chicago, Phoenix and Switzerland"
          />
          <section className="landing-sheet" aria-labelledby="selected-writing">
            <h1 className="sr-only">Jason Latz</h1>
            <h2 id="selected-writing">Selected writing</h2>
            <Suspense fallback={<Link href="/writings">All writings →</Link>}>
              <SelectedWriting />
            </Suspense>
          </section>
        </div>
      </section>
      <div className="landing-below">
        <DeskEntry />
        <HomeActivity />
      </div>
    </div>
  );
}
