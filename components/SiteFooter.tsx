export default function SiteFooter() {
  const socialLinks = [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/jasonlatz" },
    { label: "GitHub", href: "https://github.com/Jason-Latz" },
    { label: "Instagram", href: "https://www.instagram.com/json.latz/" }
  ];

  return (
    <footer className="site-footer">
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap"
        }}
      >
        <p style={{ margin: 0 }}>© {new Date().getFullYear()} Jason Latz. All rights reserved.</p>
        <nav
          aria-label="Social links"
          style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}
        >
          {socialLinks.map((link) => (
            <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
