import Link from "next/link";
import DuolingoStreak from "@/components/DuolingoStreak";
import SpotifyNowPlaying from "@/components/SpotifyNowPlaying";
import { formatDate } from "@/lib/date";
import { fetchPublishedPosts } from "@/lib/posts";

export default async function HomePage() {
  const posts = await fetchPublishedPosts();
  const latestPost = posts[0] ?? null;

  return (
    <div className="hero">
      <div className="activity-ribbon" aria-label="Live activity">
        <SpotifyNowPlaying />
        <DuolingoStreak />
      </div>
      <div className="pill">Research, product, and thoughtful writing</div>
      <h1>Building calm, deliberate products and ideas.</h1>
      <p>
        I share writing on technology, leadership, and the quiet decisions that
        shape teams. This space is a home for essays, notes, and a record of my
        work.
      </p>

      <div className="section">
        <h2>Latest writing</h2>
        <div className="card">
          {latestPost ? (
            <>
              <h3>{latestPost.title}</h3>
              <p className="post-meta">
                {latestPost.published_at
                  ? formatDate(latestPost.published_at)
                  : "Published"}
              </p>
              <p>{latestPost.excerpt ?? "Read the latest article from the archive."}</p>
              <Link href={`/writings/${latestPost.slug}`}>Read the article →</Link>
            </>
          ) : (
            <>
              <h3>No published writing yet</h3>
              <p className="post-meta">Drafts are available in the editor.</p>
              <p>Publish your first article and it will show up here automatically.</p>
              <Link href="/writings">Read the archive →</Link>
            </>
          )}
        </div>
      </div>

      <div className="section">
        <h2>Now</h2>
        <div className="card">
          <p>
            Advising early-stage teams, writing about applied AI, and exploring
            the future of thoughtful interfaces.
          </p>
          <Link href="/experience">View experience →</Link>
        </div>
      </div>
    </div>
  );
}
