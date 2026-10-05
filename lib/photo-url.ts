// Pure URL construction, safe to import in browser bundles without pulling in
// the Supabase catalog client. Keep this separate from lib/photos.ts.
type PublicRenderOptions = {
  width: number;
  quality?: number;
  resize?: "cover" | "contain" | "fill";
};

export function buildPublicRenderUrl(originalUrl: string, options: PublicRenderOptions) {
  const width = Math.max(1, Math.round(options.width));
  const quality = typeof options.quality === "number"
    ? Math.min(100, Math.max(1, Math.round(options.quality)))
    : null;

  let url: URL;
  try { url = new URL(originalUrl); } catch { return originalUrl; }

  url.pathname = url.pathname.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/"
  );
  url.searchParams.set("width", String(width));
  url.searchParams.set("resize", options.resize ?? "contain");
  if (quality !== null) url.searchParams.set("quality", String(quality));
  return url.toString();
}
