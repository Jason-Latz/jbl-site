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
      <h1>Experience</h1>
      <p className="post-meta">
        Resume-backed snapshot of education, work, projects, and technical focus.
      </p>

      <div className="section">
        <h2>Education</h2>
        <div className="card">
          <h3>
            {education.school} · {education.location}
          </h3>
          <p className="post-meta">{education.period}</p>
          <p>
            {education.degree} | GPA {education.gpa}
          </p>
        </div>
      </div>

      <div className="section post-list">
        <h2>Professional Experience</h2>
        {experience.map((item) => (
          <div key={`${item.role}-${item.organization}`} className="card">
            <h3>
              {item.role} · {item.organization}
            </h3>
            <p className="post-meta">
              {item.location} · {item.period}
            </p>
            <p className="post-meta">{item.stack}</p>
            {item.highlights.map((highlight) => (
              <p key={highlight}>{highlight}</p>
            ))}
          </div>
        ))}
      </div>

      <div className="section post-list">
        <h2>Projects</h2>
        {projects.map((project) => (
          <div key={project.name} className="card">
            <h3>{project.name}</h3>
            <p className="post-meta">{project.period}</p>
            <p className="post-meta">{project.stack}</p>
            {project.highlights.map((highlight) => (
              <p key={highlight}>{highlight}</p>
            ))}
            {project.link ? (
              <p className="post-meta">
                <a href={project.link} target="_blank" rel="noreferrer">
                  View on GitHub
                </a>
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="section post-list">
        <h2>Technical Skills</h2>
        <div className="card">
          <p>
            <strong>Programming & Libraries:</strong> {technicalSkills.programming}
          </p>
          <p>
            <strong>Tools & Platforms:</strong> {technicalSkills.tools}
          </p>
        </div>
      </div>

      <div className="section post-list">
        <h2>Activities</h2>
        {activities.map((activity) => (
          <div key={activity.name} className="card">
            <h3>{activity.name}</h3>
            <p className="post-meta">{activity.period}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
