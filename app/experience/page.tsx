const experience = [
  {
    role: "Founder & Writer",
    place: "Your Studio",
    period: "2022 — Present",
    summary:
      "Exploring the intersection of research, product, and thoughtful storytelling."
  },
  {
    role: "Product Lead",
    place: "Example Company",
    period: "2019 — 2022",
    summary:
      "Led cross-functional teams building human-centered software for global users."
  },
  {
    role: "Design Researcher",
    place: "Example Lab",
    period: "2016 — 2019",
    summary:
      "Studied how teams collaborate under uncertainty and shipped new workflows."
  }
];

export default function ExperiencePage() {
  return (
    <section className="section">
      <h1>Experience</h1>
      <p className="post-meta">
        A lightweight record of the work that shaped my thinking.
      </p>
      <div className="section post-list">
        {experience.map((item) => (
          <div key={item.role} className="card">
            <h3>
              {item.role} · {item.place}
            </h3>
            <p className="post-meta">{item.period}</p>
            <p>{item.summary}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
