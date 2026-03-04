import { fetchPublicPhotos } from "@/lib/photos";

export const revalidate = 60;

export default async function PhotographyPage() {
  const photos = await fetchPublicPhotos();

  return (
    <section className="section photography-section">
      <h1>Photography</h1>
      <p className="post-meta">Moments, places, and details.</p>

      {photos.length === 0 ? (
        <div className="card section">
          <p>No photos published yet.</p>
        </div>
      ) : (
        <div className="photo-stage section">
          <div className="photo-masonry">
            {photos.map((photo) => (
              <figure key={photo.path} className="photo-tile">
                <img
                  src={photo.url}
                  alt={photo.alt}
                  loading="lazy"
                  decoding="async"
                />
              </figure>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
