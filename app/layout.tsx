import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import ThemeToggle from "@/components/ThemeToggle";
import TravelBackgroundWarmup from "@/components/TravelBackgroundWarmup";

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

  let theme = "light";
  try {
    const stored = localStorage.getItem(key);
    theme = stored === "dark" || stored === "light" ? stored : "light";
  } catch {
    theme = "light";
  }
  root.setAttribute("data-theme", theme);

  // Homepage only: preload the active-theme desk poster from here, the earliest
  // point the theme is known, so the poster-first hero has its image in hand at
  // first paint. Guarded to "/" and to one theme so inner pages and the
  // off-theme poster are never fetched.
  try {
    if (location.pathname === "/") {
      var portrait = window.matchMedia("(orientation: portrait)").matches;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href =
        "/desk-poster-" + (portrait ? "portrait-" : "") + theme + ".jpg";
      link.setAttribute("fetchpriority", "high");
      (document.head || root).appendChild(link);
    }
  } catch {}
})();
`;

const supabaseConnectionTarget = (() => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return null;
  }

  try {
    const parsed = new URL(supabaseUrl);
    return {
      origin: parsed.origin,
      dnsPrefetch: `//${parsed.hostname}`
    };
  } catch {
    return null;
  }
})();

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
        {supabaseConnectionTarget ? (
          <>
            <link
              rel="preconnect"
              href={supabaseConnectionTarget.origin}
              crossOrigin="anonymous"
            />
            <link rel="dns-prefetch" href={supabaseConnectionTarget.dnsPrefetch} />
          </>
        ) : null}
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
        <TravelBackgroundWarmup />
        <Analytics />
      </body>
    </html>
  );
}
