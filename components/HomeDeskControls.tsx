"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import hotspots from "@/app/desk-hotspots.json";
import DeskEntry from "./DeskEntry";
import ThemeToggle from "./ThemeToggle";

const PanelBody = dynamic(() => import("./HomeDeskPanel"), {
  loading: () => <p role="status">Opening…</p>
});

const pages = [
  ["writings", "Writings"],
  ["travel", "Travel"],
  ["photography", "Photography"],
  ["experience", "Experience"]
] as const;

const photos = {
  chicago: { label: "Chicagohenge", file: "1772606246175-3-7a726b34-f582-4df1-93d4-7ecc21fb8631-img-3242.jpeg" },
  phoenix: { label: "Phoenix sunset", file: "1772606246175-5-faaac8c6-47ea-4334-9553-ee841e74112c-img-3676.jpeg" },
  switzerland: { label: "Swiss Alps", file: "1772606060693-11-b56f0a22-4a6f-4611-9011-746f7008c420-img-0208.jpeg" }
};

const panelTitles = { records: "On the platter", chess: "The world vs. Jason" };
type Photo = keyof typeof photos;
type Panel = keyof typeof panelTitles | Photo;
type Spot = Exclude<keyof typeof hotspots.desktop, "sheet">;

function spotStyle(spot: Spot, darkSpot: Spot = spot): CSSProperties {
  const fields: Record<string, string> = {};
  for (const framing of ["desktop", "tablet", "mobile"] as const) {
    for (const [variant, key] of [["", spot], ["-dark", darkSpot]] as const) {
      if (variant && key === spot) continue;
      const [left, top, width, height] = hotspots[framing][key];
      const prefix = `--${framing}${variant}`;
      fields[prefix + "-x"] = `${left + width / 2}%`;
      fields[prefix + "-y"] = `${top + height / 2}%`;
      fields[prefix + "-w"] = `${width}%`;
      fields[prefix + "-h"] = `${height}%`;
    }
  }
  return fields as CSSProperties;
}

function photoUrl(photo: Photo) {
  const host = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return host ? new URL(`/storage/v1/object/public/photos/${photos[photo].file}`, host).href : null;
}

export default function HomeDeskControls() {
  const [active, setActive] = useState<Panel | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLAnchorElement | null>(null);
  const title = active && (active in photos ? photos[active as Photo].label : panelTitles[active as keyof typeof panelTitles]);

  useEffect(() => {
    if (active && !dialog.current?.open) dialog.current?.showModal();
  }, [active]);

  function open(event: MouseEvent<HTMLAnchorElement>, panel: Panel) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    trigger.current = event.currentTarget;
    setActive(panel);
  }

  function renderHotspot(spot: Panel, label: string, href: string) {
    return (
      <a key={spot} className={`landing-hit landing-object landing-${spot}`}
        style={spotStyle(spot, spot === "records" ? "recordsDark" : spot)} href={href}
        onClick={(event) => open(event, spot)} aria-haspopup="dialog">
        <span className="landing-hit-label">{label}</span>
      </a>
    );
  }

  return (
    <>
      <nav className="landing-controls" aria-label="Main navigation">
        <DeskEntry style={spotStyle("desk")} />
        {pages.map(([slug, label]) => (
          <Link className="landing-hit landing-key" style={spotStyle(slug)} key={slug} href={`/${slug}`} prefetch={false}>
            <span className="sr-only">{label}</span>
          </Link>
        ))}
      </nav>
      <ThemeToggle className="landing-hit landing-object landing-lamp" style={spotStyle("lamp", "lampDark")} />
      {renderHotspot("records", "Record player", "/desk?focus=records")}
      {renderHotspot("chess", "Chessboard", "/desk?focus=chess")}
      {(Object.keys(photos) as Photo[]).map((photo) => renderHotspot(photo, photos[photo].label, photoUrl(photo) ?? "/photography"))}
      <dialog
        ref={dialog}
        className="landing-dialog"
        aria-labelledby="landing-panel-title"
        onClose={() => { setActive(null); trigger.current?.focus(); }}
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      >
        {active ? (
          <div className="landing-panel">
            <header className="desk-panel-head">
              <h2 id="landing-panel-title">{title}</h2>
              <button className="desk-panel-close" type="button" onClick={() => dialog.current?.close()} aria-label="Close panel">×</button>
            </header>
            <div className="desk-panel-body">
              <PanelBody panel={active} image={active in photos ? photoUrl(active as Photo) : null} title={title || ""} />
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
