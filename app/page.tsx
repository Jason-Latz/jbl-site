import Link from "next/link";
import DuolingoStreak from "@/components/DuolingoStreak";

export default function HomePage() {
  return (
    <div className="hero">
      <DuolingoStreak />
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
          <h3>Why minimal interfaces matter</h3>
          <p className="post-meta">Draft · Coming soon</p>
          <p>
            A short essay on how restraint in design builds trust and focus in
            modern tools.
          </p>
          <Link href="/writings">Read the archive →</Link>
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
