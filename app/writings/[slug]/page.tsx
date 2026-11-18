import { notFound } from "next/navigation";
import Link from "next/link";
import "../writings.css";
import { formatDate } from "@/lib/date";
import { fetchPostBySlug } from "@/lib/posts";
import { renderWritingMarkdown, type WritingHeading } from "@/lib/writingMarkdown";

export const revalidate = 60;

function OutlineLinks({ headings }: { headings: WritingHeading[] }) {
  const firstLevel = Math.min(...headings.map((heading) => heading.level));

  return (
    <ul className="writing-outline-links">
      {headings.map(({ id, title, level }) => (
        <li key={id} style={{ paddingInlineStart: `${Math.min(level - firstLevel, 3) * 0.65}rem` }}>
          <a href={`#${id}`}>{title}</a>
        </li>
      ))}
    </ul>
  );
}

export async function generateMetadata({
  params
}: {
  params: { slug: string };
}) {
  const post = await fetchPostBySlug(params.slug);
  return {
    title: post?.title ?? "Writing",
    description: post?.excerpt ?? "Writing archive."
  };
}

export default async function WritingPage({
  params
}: {
  params: { slug: string };
}) {
  const post = await fetchPostBySlug(params.slug);

  if (!post) {
    notFound();
  }

  const { body, headings, minutes } = await renderWritingMarkdown(post.content ?? "");
  const hasOutline = headings.length > 0;

  return (
    <div className={`writing-detail${hasOutline ? " writing-detail-with-outline" : ""}`}>
      {hasOutline ? (
        <nav className="writing-outline writing-outline-rail" aria-label="On this page">
          <p>On this page</p>
          <OutlineLinks headings={headings} />
        </nav>
      ) : null}
      <div className="writing-main">
        <nav className="writing-detail-nav" aria-label="Writing navigation">
          <Link href="/writings">← All writings</Link>
        </nav>
        <article className="section content writing-paper">
          <h1>{post.title}</h1>
          <p className="post-meta writing-meta">
            {post.published_at ? (
              <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
            ) : <span>Draft</span>}
            {minutes > 0 ? (
              <><span aria-hidden="true">·</span><span>{minutes} min read</span></>
            ) : null}
          </p>
          {hasOutline ? (
            <details className="writing-outline writing-outline-inline">
              <summary>On this page</summary>
              <nav aria-label="On this page"><OutlineLinks headings={headings} /></nav>
            </details>
          ) : null}
          {body}
        </article>
        <Link className="writing-detail-back" href="/writings">← All writings</Link>
      </div>
    </div>
  );
}
