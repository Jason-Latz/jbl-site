// Immutable bake manifest. Keep these units in sync with the named,
// non-emissive materials in the GLB whenever the bake version changes.
const DEFAULT_BAKE_BASE =
  "https://qllalbklzxtsvqzszigo.supabase.co/storage/v1/object/public/bake/v1";

export const BAKE_BASE =
  process.env.NEXT_PUBLIC_BAKE_CDN_URL || DEFAULT_BAKE_BASE;
export const BAKED_GLB_URL = process.env.NEXT_PUBLIC_BAKE_CDN_URL
  ? `${BAKE_BASE}/desk-window-uv1-slim82.glb`
  : "/desk-static-f5fbb9104223.glb";

const LIGHTMAP_UNITS = [
  106, 107, 113, 114, 115, 116, 117, 119, 124, 128, 134, 135, 136
] as const;

// Start downloads alongside the scene code, rather than waiting for Three.js
// to load, parse the GLB, and discover its lightmaps. Low priority leaves the
// poster, fonts, and navigation ahead of these requests.
export function preloadBakedDesk(theme: "light" | "dark") {
  const state = theme === "dark" ? "off" : "on";
  const assets = [
    { href: BAKED_GLB_URL, as: "fetch" },
    ...LIGHTMAP_UNITS.map((unit) => ({
      href: `${BAKE_BASE}/lightmaps/bakeunit_${unit}-${state}.webp`,
      as: "image"
    }))
  ];

  const links = assets.map(({ href, as }) => {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = as;
    link.href = href;
    link.crossOrigin = "anonymous";
    link.setAttribute("fetchpriority", "low");
    link.dataset.deskPreload = "true";
    document.head.appendChild(link);
    return link;
  });

  return () => links.forEach((link) => link.remove());
}
