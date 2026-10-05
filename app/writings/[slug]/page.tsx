import { notFound } from "next/navigation";
import Link from "next/link";
import "../writings.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDate } from "@/lib/date";
import { fetchPostBySlug } from "@/lib/posts";

export const revalidate = 60;

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

  const content = post.content ?? "";

  return (
    <div className="writing-detail">
      <nav className="writing-detail-nav" aria-label="Writing navigation"><Link href="/writings">← All writings</Link><a href="/desk?focus=reading">The bookshelf ↗</a></nav>
    <article className="section content writing-paper">
      <h1>{post.title}</h1>
      <p className="post-meta">
        {post.published_at ? formatDate(post.published_at) : "Draft"}
      </p>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </article>
    <Link className="writing-detail-back" href="/writings">Back to the notebook →</Link>
    </div>
  );
}
