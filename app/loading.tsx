// Keep the shared header available while any route waits for server data.
export default function Loading() {
  return (
    <section className="section" aria-busy="true" aria-live="polite">
      <p className="post-meta">Loading page…</p>
    </section>
  );
}
