"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Desk", href: "/desk" },
  { label: "Writings", href: "/writings" },
  { label: "Travel", href: "/travel" },
  { label: "Photography", href: "/photography" },
  { label: "Experience", href: "/experience" }
];

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {navItems.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        if (item.href === "/desk") {
          return <a key={item.href} href={item.href} aria-current={active ? "page" : undefined}>{item.label}</a>;
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            // Don't download the globe, photo catalog, or auth route just
            // because their links are visible over a loading desk.
            prefetch={
              item.href === "/travel" ||
              item.href === "/photography"
                ? false
                : undefined
            }
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
