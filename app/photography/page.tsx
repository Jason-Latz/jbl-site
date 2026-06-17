import { fetchPublicPhotos } from "@/lib/photos";
import PhotoMosaic from "@/components/PhotoMosaic";

export const revalidate = 60;

export default async function PhotographyPage() {
  const photos = await fetchPublicPhotos();

  return (
    <section className="section photography-section">
      <h1>Photography</h1>
      <p className="post-meta">
        Frames from the road, and the occasional still life.
      </p>

      {photos.length === 0 ? (
        <div className="card section">
          <p>No photographs published yet.</p>
        </div>
      ) : (
        <PhotoMosaic photos={photos} />
      )}
    </section>
  );
}
