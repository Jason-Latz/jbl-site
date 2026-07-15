"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Writings", href: "/writings" },
  { label: "Travel", href: "/travel" },
  { label: "Photography", href: "/photography" },
  { label: "Experience", href: "/experience" },
  { label: "Admin", href: "/admin" }
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
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
