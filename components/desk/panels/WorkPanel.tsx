"use client";

// Compact digest of /experience — names, titles, dates pulled verbatim
// from app/experience/page.tsx. Update there first; mirror here.

type DigestRow = {
  title: string;
  meta: string;
  href?: string;
};

const now: DigestRow[] = [
  {
    title: "Vulcan (Y Combinator S25) · Founding Software Engineer",
    meta: "Austin, TX · Dec 2025 - Present"
  },
  {
    title: "Northwestern University · B.S. in Computer Science (AI Concentration) and Psychology",
    meta: "Evanston, IL · Expected June 2027"
  }
];

const nowFocus =
  "Anthropic tooling over 200,000+ state statutes — autonomous regulation workflows deployed in CA, TX, WV, and GA state governments.";

const before: DigestRow[] = [
  {
    title: "Nyck.ai (AI Procurement Startup) · Founding Software Engineer",
    meta: "Evanston, IL · March 2025 - Sept 2025"
  },
  {
    title: "Northwestern C3 Artificial Intelligence Lab · Research Assistant",
    meta: "Evanston, IL · Dec 2024 - June 2025"
  },
  {
    title: "Northwestern University · Undergraduate Teaching Assistant",
    meta: "Evanston, IL · March 2025 - June 2025"
  },
  {
    title: "U.S. House of Representatives · Legislative Intern",
    meta: "Washington, D.C. · June 2022 - July 2022"
  }
];

const projects: DigestRow[] = [
  {
    title: "PDF Translator + Flashcard Generator",
    meta: "Sept 2025 · Python, TypeScript, FastAPI, SQLite, spaCy, wordfreq, AWS ECS, S3",
    href: "https://github.com/Jason-Latz/Kindle_pdf_translation"
  },
  {
    title: "Python Compiler",
    meta: "March 2024 · C, Test-Driven Development"
  }
];

function Rows({ rows, footnote }: { rows: DigestRow[]; footnote?: string }) {
  return (
    <ul className="desk-panel-list">
      {rows.map((row) => (
        <li key={row.title} className="desk-panel-row">
          <div className="desk-panel-row-main">
            <p className="desk-panel-row-title" title={row.title}>
              {row.href ? (
                <a href={row.href} target="_blank" rel="noreferrer">
                  {row.title}
                </a>
              ) : (
                row.title
              )}
            </p>
            <p className="desk-panel-meta" title={row.meta}>
              {row.meta}
            </p>
          </div>
        </li>
      ))}
      {footnote ? (
        <li className="desk-panel-row">
          <p className="desk-panel-empty">{footnote}</p>
        </li>
      ) : null}
    </ul>
  );
}

export default function WorkPanel() {
  return (
    <>
      <section className="desk-panel-section">
        <div className="desk-panel-note">
          <p className="desk-panel-note-body">
            The short version of what I&apos;ve been building and where.
          </p>
        </div>
      </section>

      <section className="desk-panel-section">
        <h3 className="desk-panel-section-title">NOW</h3>
        <Rows rows={now} footnote={nowFocus} />
      </section>

      <section className="desk-panel-section">
        <h3 className="desk-panel-section-title">BEFORE</h3>
        <Rows rows={before} />
      </section>

      <section className="desk-panel-section">
        <h3 className="desk-panel-section-title">PROJECTS</h3>
        <Rows rows={projects} />
      </section>

      <section className="desk-panel-section">
        <p className="desk-panel-meta">
          <a href="/experience">the full resume →</a>
        </p>
      </section>
    </>
  );
}
