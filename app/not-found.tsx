import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section not-found-page">
      <header className="page-header">
        <p className="eyebrow">404</p>
        <h1>That page wandered off.</h1>
        <p className="standfirst">
          The link may be old, or the page may have moved somewhere else on the
          desk.
        </p>
      </header>
      <div className="page-recovery-actions">
        <Link className="primary" href="/">
          Back home
        </Link>
        <Link className="secondary" href="/writings">
          Browse writings
        </Link>
      </div>
    </section>
  );
}
