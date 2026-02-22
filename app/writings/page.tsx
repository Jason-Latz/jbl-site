import Link from "next/link";
import { formatDate } from "@/lib/date";
import { fetchPublishedPosts } from "@/lib/posts";

export const revalidate = 60;

export default async function WritingsPage() {
  const posts = await fetchPublishedPosts();

  return (
    <section className="section">
      <h1>Writings</h1>
      <p className="post-meta">
        Essays, notes, and reflections on building with clarity.
      </p>

      <div className="section post-list">
        {posts.length === 0 ? (
          <div className="card">
            <p>No published posts yet. Check back soon.</p>
          </div>
        ) : (
          posts.map((post) => (
            <Link key={post.id} href={`/writings/${post.slug}`}>
              <div className="card">
                <h3>{post.title}</h3>
                <p className="post-meta">
                  {post.published_at ? formatDate(post.published_at) : "Draft"}
                </p>
                {post.excerpt && <p>{post.excerpt}</p>}
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
