import { fetchPublicPhotos } from "@/lib/photos";
import { buildPublicRenderUrl } from "@/lib/photos";

const COMPARISON_COUNT = 6;
const RENDER_WIDTH = 1600;

type Variant = {
  label: string;
  quality: number | null;
  note: string;
};

const variants: Variant[] = [
  {
    label: "Preferred (q92)",
    quality: 92,
    note: "Display-sized, sharp + lighter"
  },
  {
    label: "Fallback (q90)",
    quality: 90,
    note: "Display-sized, lightest option"
  },
  {
    label: "Original",
    quality: null,
    note: "Full source file"
  }
];

function pickSamplePhotos<T>(items: T[], count: number): T[] {
  if (items.length <= count) {
    return items;
  }

  if (count <= 1) {
    return items.slice(0, 1);
  }

  const chosen = new Set<number>();
  const step = (items.length - 1) / (count - 1);

  for (let index = 0; index < count; index += 1) {
    chosen.add(Math.round(index * step));
  }

  return Array.from(chosen)
    .sort((a, b) => a - b)
    .map((index) => items[index]);
}

export default async function TravelQualityLabPage() {
  const photos = await fetchPublicPhotos();
  const samplePhotos = pickSamplePhotos(photos, COMPARISON_COUNT);

  return (
    <section className="section">
      <h1>Travel Quality Lab</h1>
      <p className="post-meta">
        Side-by-side comparison for the same photo at different delivery settings.
      </p>
      <p className="post-meta">
        Display-sized variants use width {RENDER_WIDTH}px with width-only resizing
        (no crop), so each photo keeps its captured aspect ratio.
      </p>

      {samplePhotos.length === 0 ? (
        <div className="card section">
          <p>No photos available for comparison yet.</p>
        </div>
      ) : (
        <div className="section" style={{ display: "grid", gap: "1.25rem" }}>
          {samplePhotos.map((photo) => (
            <article key={photo.path} className="card" style={{ padding: "1rem" }}>
              <p className="post-meta" style={{ marginTop: 0 }}>
                {photo.path}
              </p>

              <div
                style={{
                  display: "grid",
                  gap: "0.9rem",
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))"
                }}
              >
                {variants.map((variant) => {
                  const src =
                    variant.quality === null
                      ? photo.url
                      : buildPublicRenderUrl(photo.url, {
                          width: RENDER_WIDTH,
                          quality: variant.quality
                        });

                  return (
                    <div key={`${photo.path}-${variant.label}`}>
                      <p className="post-meta" style={{ marginTop: 0 }}>
                        <strong>{variant.label}</strong> · {variant.note}
                      </p>
                      <img
                        src={src}
                        alt={`${photo.alt} (${variant.label})`}
                        loading="lazy"
                        decoding="async"
                        style={{
                          display: "block",
                          width: "100%",
                          height: "auto",
                          borderRadius: "10px",
                          border: "1px solid var(--border)",
                          background: "var(--thumb-bg)"
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
