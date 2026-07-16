import { fetchPublicPhotos } from "@/lib/photos";
import PhotoMosaic from "@/components/PhotoMosaic";

export const revalidate = 60;

export default async function PhotographyPage() {
  const photos = await fetchPublicPhotos();

  return (
    <section className="section photography-section">
      <header className="page-header">
        <p className="eyebrow">Photography</p>
        <h1>Frames from the Road</h1>
        <p className="standfirst">And the occasional still life.</p>
      </header>

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
