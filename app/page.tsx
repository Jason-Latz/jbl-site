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
      <div className="pill">doing cool things?</div>
      <h1>Out and about, occasionally building things.</h1>
      <p>
        I'm doing a lot of travelling, vibe coding, and occasionally startup
        things. I also like writing.
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
          <p>see what I've been up to</p>
          <Link href="/experience">View experience →</Link>
        </div>
      </div>
    </div>
  );
}
