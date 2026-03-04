import Link from "next/link";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Writings", href: "/writings" },
  { label: "Photography", href: "/photography" },
  { label: "Experience", href: "/experience" },
  { label: "Admin", href: "/admin" }
];

export default function SiteNav() {
  return (
    <nav className="nav">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
