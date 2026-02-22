import AdminEditor from "./AdminEditor";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <section className="section">
      <h1>Editor</h1>
      <p className="post-meta">
        Sign in to draft, edit, and publish your writing.
      </p>
      <AdminEditor />
    </section>
  );
}
