import { fetchPublicPhotos } from "@/lib/photos";
import PhotoMosaic from "@/components/PhotoMosaic";

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
        <PhotoMosaic photos={photos} />
      )}
    </section>
  );
}
