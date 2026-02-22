import { notFound } from "next/navigation";
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

  return (
    <article className="section content">
      <h1>{post.title}</h1>
      <p className="post-meta">
        {post.published_at ? formatDate(post.published_at) : "Draft"}
      </p>
      <div dangerouslySetInnerHTML={{ __html: post.content ?? "" }} />
    </article>
  );
}
