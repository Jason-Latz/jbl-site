import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import SpotifyNowPlaying from "@/components/SpotifyNowPlaying";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  adjustFontFallback: false
});

export const metadata: Metadata = {
  title: "Your Name",
  description: "Minimalist personal website and writing archive."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`}>
      <body>
        <header className="site-header">
          <div className="container">
            <div className="site-header-top">
              <div className="site-title">Your Name</div>
              <SiteNav />
            </div>
            <SpotifyNowPlaying />
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
