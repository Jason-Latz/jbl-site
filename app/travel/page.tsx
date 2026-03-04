import { fetchPublicPhotos } from "@/lib/photos";
import PhotoMosaic from "@/components/PhotoMosaic";

export const revalidate = 60;

export default async function TravelPage() {
  const photos = await fetchPublicPhotos();

  return (
    <section className="section travel-section">
      <h1>Travel</h1>
      <p className="post-meta">Journeys, places, and details.</p>

      {photos.length === 0 ? (
        <div className="card section">
          <p>No travel photos published yet.</p>
        </div>
      ) : (
        <PhotoMosaic photos={photos} />
      )}
    </section>
  );
}
