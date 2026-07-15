import Link from "next/link";
import { formatDate } from "@/lib/date";
import { fetchPublishedPosts } from "@/lib/posts";

export const revalidate = 60;

export default async function WritingsPage() {
  const posts = await fetchPublishedPosts();

  return (
    <section className="section">
      <header className="page-header">
        <p className="eyebrow">Writings</p>
        <h1>Essays and Notes</h1>
        <p className="standfirst">
          Essays, notes, and reflections on building with clarity.
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="card">
          <p>No published posts yet. Check back soon.</p>
        </div>
      ) : (
        <div className="essay-list">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/writings/${post.slug}`}
              className="essay-item"
            >
              <span className="essay-date">
                {post.published_at ? formatDate(post.published_at) : "Draft"}
              </span>
              <div>
                <h3 className="essay-title">{post.title}</h3>
                {post.excerpt && <p className="essay-excerpt">{post.excerpt}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
