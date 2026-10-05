"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const Spotify = dynamic(() => import("./SpotifyNowPlaying"), { ssr: false });
const Duolingo = dynamic(() => import("./DuolingoStreak"), { ssr: false });

// Live activity is a below-the-fold extra. Don't start its downloads/pollers
// until the visitor approaches it; reserve its compact row throughout.
export default function HomeActivity() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "100px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="landing-activity">
      <p className="eyebrow">In the background</p>
      <div className="activity-ribbon" aria-label="Live activity">
        {visible ? <><Spotify /><Duolingo /></> : <p className="post-meta">Music &amp; a little daily practice.</p>}
      </div>
    </div>
  );
}
