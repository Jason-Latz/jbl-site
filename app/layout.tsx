import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
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
  metadataBase: new URL("https://www.jasonlatz.com"),
  title: {
    default: "Jason Latz",
    template: "%s | Jason Latz"
  },
  description:
    "Jason Latz's interactive desk, writing, photography, travel, and experience.",
  openGraph: {
    type: "website",
    siteName: "Jason Latz",
    locale: "en_US",
    images: [{
      url: "/social/compass-v1.png",
      width: 1200,
      height: 630,
      type: "image/png",
      alt: "A copper and charcoal compass rose above Jason Latz's name on warm ivory paper."
    }]
  },
  twitter: {
    card: "summary_large_image"
  }
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

  // Home uses the overhead still; /desk uses the viewport-matched poster.
  // Only preload the active image, never the model or the scene on home.
  try {
    if (location.pathname === "/" || location.pathname === "/desk") {
      var portrait = location.pathname === "/desk" && window.matchMedia("(orientation: portrait)").matches;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = location.pathname === "/"
        ? "/home-desk-" + (window.matchMedia("(min-width: 1024px)").matches ? "desktop" : "mobile") + "-" + theme + "-v1.webp"
        : "/desk-poster-" + (portrait ? "portrait-" : "") + theme + ".jpg";
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
        {/* Run directly during HTML parsing: theme and poster loading must
            not wait for the Next.js runtime to download and hydrate. */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
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
              <a className="site-title" href="/">Jason Latz</a>
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
