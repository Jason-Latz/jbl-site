import Link from "next/link";
import DuolingoStreak from "@/components/DuolingoStreak";
import SpotifyNowPlaying from "@/components/SpotifyNowPlaying";
import { formatDate } from "@/lib/date";
import { fetchPublishedPosts } from "@/lib/posts";

export const revalidate = 60;

export default async function HomePage() {
  const posts = await fetchPublishedPosts();
  const latestPost = posts[0] ?? null;

  return (
    <div className="hero">
      <div className="activity-ribbon" aria-label="Live activity">
        <SpotifyNowPlaying />
        <DuolingoStreak />
      </div>
      <h1>Out and about, occasionally building things.</h1>
      <p className="hero-intro">
        I'm doing a lot of travelling, vibe coding, and occasionally startup
        things. I also like writing.
      </p>

      <div className="section">
        <h2>Latest writing</h2>
        <div className="card home-card">
          {latestPost ? (
            <>
              <h3>{latestPost.title}</h3>
              <p className="post-meta home-card-meta">
                {latestPost.published_at
                  ? formatDate(latestPost.published_at)
                  : "Published"}
              </p>
              <p className="home-card-copy">
                {latestPost.excerpt ?? "Read the latest article from the archive."}
              </p>
              <Link className="home-card-link" href={`/writings/${latestPost.slug}`}>
                Read the article →
              </Link>
            </>
          ) : (
            <>
              <h3>No published writing yet</h3>
              <p className="post-meta home-card-meta">
                Drafts are available in the editor.
              </p>
              <p className="home-card-copy">
                Publish your first article and it will show up here automatically.
              </p>
              <Link className="home-card-link" href="/writings">
                Read the archive →
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="section">
        <h2>Now</h2>
        <div className="card home-card">
          <h3>Experience</h3>
          <p className="home-card-copy">See what I've been up to.</p>
          <Link className="home-card-link" href="/experience">
            View experience →
          </Link>
        </div>
      </div>
    </div>
  );
}
