export default function SiteFooter() {
  const socialLinks = [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/jasonlatz" },
    { label: "GitHub", href: "https://github.com/Jason-Latz" },
    { label: "Instagram", href: "https://www.instagram.com/json.latz/" }
  ];

  return (
    <footer className="site-footer">
      <div className="container">
        <div>
          <span className="site-footer-mark">Jason Latz</span>
          <p className="site-footer-copy">
            © {new Date().getFullYear()} Jason Latz. All rights reserved.
          </p>
        </div>
        <nav className="site-footer-social" aria-label="Social links">
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
