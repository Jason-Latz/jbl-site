import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import ThemeToggle from "@/components/ThemeToggle";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  adjustFontFallback: false
});

export const metadata: Metadata = {
  title: "Jason Latz",
  description: "Minimalist personal website and writing archive."
};

const themeInitScript = `
(() => {
  const key = "site-theme";
  const root = document.documentElement;

  try {
    const stored = localStorage.getItem(key);
    const nextTheme = stored === "dark" || stored === "light" ? stored : "light";
    root.setAttribute("data-theme", nextTheme);
  } catch {
    root.setAttribute("data-theme", "light");
  }
})();
`;

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable}`}
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body>
        <header className="site-header">
          <div className="container">
            <div className="site-header-top">
              <div className="site-title">Jason Latz</div>
              <div className="site-header-controls">
                <SiteNav />
                <ThemeToggle />
              </div>
            </div>
          </div>
        </header>
        <main>
          <div className="container">{children}</div>
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
