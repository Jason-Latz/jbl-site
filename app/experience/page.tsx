type ExperienceItem = {
  role: string;
  organization: string;
  location: string;
  period: string;
  stack: string;
  highlights: string[];
};

type ProjectItem = {
  name: string;
  stack: string;
  period: string;
  highlights: string[];
  link?: string;
};

const education = {
  school: "Northwestern University",
  location: "Evanston, IL",
  degree: "B.S. in Computer Science (AI Concentration) and Psychology",
  gpa: "4.00/4.00",
  period: "Expected June 2027"
};

const experience: ExperienceItem[] = [
  {
    role: "Founding Software Engineer",
    organization: "Vulcan (Y Combinator S25)",
    location: "Austin, TX",
    period: "Dec 2025 - Present",
    stack: "LLM Integration, Selenium, AWS Lambda, S3",
    highlights: [
      "Created automated scraping tools to amass 200,000+ state statutes across multiple states.",
      "Integrated Anthropic tooling with legislative data to build an autonomous regulation workflow with 50+ tools, including vector search and context-aware document editing, now deployed in CA, TX, WV, and GA state governments."
    ]
  },
  {
    role: "Founding Software Engineer",
    organization: "Nyck.ai (AI Procurement Startup)",
    location: "Evanston, IL",
    period: "March 2025 - Sept 2025",
    stack: "Python, JavaScript, Pydantic AI, Azure AI Foundry",
    highlights: [
      "Developed LLM output testing, evaluation, performance tracking, Supabase integration, and CI to measure quality over time.",
      "Reduced response latency by 72% through model tuning and tool optimization."
    ]
  },
  {
    role: "Research Assistant",
    organization: "Northwestern C3 Artificial Intelligence Lab",
    location: "Evanston, IL",
    period: "Dec 2024 - June 2025",
    stack: "Python, RAG, Real-time Speech Processing",
    highlights: [
      "Engineered an AI-powered Zoom avatar for prospective-student events that could detect relevant context and answer Northwestern-related questions in meetings."
    ]
  },
  {
    role: "Undergraduate Teaching Assistant",
    organization: "Northwestern University",
    location: "Evanston, IL",
    period: "March 2025 - June 2025",
    stack: "Data Structures and Algorithms",
    highlights: [
      "Led weekly sessions for 50+ students and reinforced trees, hash tables, and Big-O with live coding and whiteboard walkthroughs."
    ]
  },
  {
    role: "Legislative Intern",
    organization: "U.S. House of Representatives",
    location: "Washington, D.C.",
    period: "June 2022 - July 2022",
    stack: "Project Management, Excel, Communication",
    highlights: [
      "Automated collection/reporting workflows in Excel, improving tracking efficiency and accuracy.",
      "Led Capitol tours for groups up to 25 constituents and translated complex political topics into accessible narratives."
    ]
  }
];

const projects: ProjectItem[] = [
  {
    name: "PDF Translator + Flashcard Generator",
    stack: "Python, TypeScript, FastAPI, SQLite, spaCy, wordfreq, AWS ECS, S3",
    period: "Sept 2025",
    highlights: [
      "Built a web app that converts book PDFs into language-learning materials in 5 languages and exports EPUB for Kindle.",
      "Auto-generated chapter-level flashcards and shipped scalable deployment with Docker and GitHub Actions."
    ],
    link: "https://github.com/Jason-Latz/Kindle_pdf_translation"
  },
  {
    name: "Python Compiler",
    stack: "C, Test-Driven Development",
    period: "March 2024",
    highlights: [
      "Designed and implemented a Python interpreter in C with a complete compilation pipeline from BNF grammar to executable behavior.",
      "Applied test-driven validation to improve extensibility and debugging speed across compiler modules."
    ]
  }
];

const technicalSkills = {
  programming:
    "Python, C, C++, TypeScript, Node.js, Anthropic Agents SDK, NumPy, FastAPI",
  tools: "Git, Azure AI Foundry, Supabase, GitHub Actions, pytest"
};

const activities = [
  { name: "Northwestern Campus Tour Guide", period: "April 2025 - Present" },
  { name: "SkillsUSA Arizona Quiz Bowl 3x Champion", period: "2021 - 2023" },
  {
    name: "University of Edinburgh Collegiate Tennis Team (Study Abroad)",
    period: "Sept 2025 - Present"
  }
];

export default function ExperiencePage() {
  return (
    <section className="section">
      <header className="page-header">
        <p className="eyebrow">Curriculum Vitae</p>
        <h1>Experience</h1>
        <p className="standfirst">
          A resume-backed snapshot of education, work, projects, and technical
          focus.
        </p>
      </header>

      <section className="section">
        <div className="section-head">
          <h2>Education</h2>
        </div>
        <article className="cv-entry">
          <div className="cv-rail">
            <span className="cv-org">{education.school}</span>
            <span className="cv-period">{education.period}</span>
            <span className="cv-location">{education.location}</span>
          </div>
          <div>
            <h3 className="cv-role">{education.degree}</h3>
            <p className="cv-note">GPA {education.gpa}</p>
          </div>
        </article>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Professional Experience</h2>
        </div>
        {experience.map((item) => (
          <article
            key={`${item.role}-${item.organization}`}
            className={
              item.period.includes("Present")
                ? "cv-entry card--marked"
                : "cv-entry"
            }
          >
            <div className="cv-rail">
              <span className="cv-org">{item.organization}</span>
              <span className="cv-period">{item.period}</span>
              <span className="cv-location">{item.location}</span>
            </div>
            <div>
              <h3 className="cv-role">{item.role}</h3>
              <div className="tag-row">
                {item.stack.split(", ").map((skill) => (
                  <span key={skill} className="tag">
                    {skill}
                  </span>
                ))}
              </div>
              <ul className="cv-highlights">
                {item.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Projects</h2>
        </div>
        {projects.map((project) => (
          <article key={project.name} className="cv-entry">
            <div className="cv-rail">
              <span className="cv-period">{project.period}</span>
            </div>
            <div>
              <h3 className="cv-role">{project.name}</h3>
              <div className="tag-row">
                {project.stack.split(", ").map((skill) => (
                  <span key={skill} className="tag">
                    {skill}
                  </span>
                ))}
              </div>
              <ul className="cv-highlights">
                {project.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
              {project.link ? (
                <a
                  className="cv-link"
                  href={project.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on GitHub ↗
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Technical Skills</h2>
        </div>
        <div className="cv-skill-group">
          <p className="eyebrow">Programming and Libraries</p>
          <div className="tag-row">
            {technicalSkills.programming.split(", ").map((skill) => (
              <span key={skill} className="tag">
                {skill}
              </span>
            ))}
          </div>
        </div>
        <div className="cv-skill-group">
          <p className="eyebrow">Tools and Platforms</p>
          <div className="tag-row">
            {technicalSkills.tools.split(", ").map((skill) => (
              <span key={skill} className="tag">
                {skill}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Activities</h2>
        </div>
        {activities.map((activity) => (
          <article key={activity.name} className="cv-entry">
            <div className="cv-rail">
              <span className="cv-period">{activity.period}</span>
            </div>
            <div>
              <h3 className="cv-role">{activity.name}</h3>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
