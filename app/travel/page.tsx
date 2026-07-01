import TravelGlobeStage from "@/components/travel/TravelGlobeStage";
import { fetchGlobePlaces, type GlobePlace } from "@/lib/travelGlobe";

export const metadata = {
  title: "Travel",
  description: "A globe of the places Jason has been — and the photos from each."
};

// Revalidate hourly so newly geolocated photos appear without a redeploy.
export const revalidate = 3600;

// The place list, server-rendered and handed to the client stage as children so
// it is always in the HTML — crawlable, no-JS friendly, and the designed
// fallback for no-WebGL / reduced-motion visitors.
function PlaceList({ places }: { places: GlobePlace[] }) {
  return (
    <ul className="travel-place-list">
      {places.map((place) => (
        <li key={place.key} className="travel-place-card">
          <div className="travel-place-card-head">
            <h3>{place.name}</h3>
            {place.region ? (
              <span className="travel-place-region">{place.region}</span>
            ) : null}
          </div>
          {place.note ? (
            <p className="travel-place-note">{place.note}</p>
          ) : null}
          {place.photoCount > 0 ? (
            <p className="travel-place-count">
              {place.photoCount} {place.photoCount === 1 ? "photo" : "photos"}
            </p>
          ) : null}
          {place.when ? (
            <p className="travel-place-when">{place.when}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default async function TravelPage() {
  const places = await fetchGlobePlaces();
  const withPhotos = places.filter((p) => p.hasPhotos);
  const photoTotal = withPhotos.reduce((sum, p) => sum + p.photoCount, 0);

  return (
    <section className="section travel-section">
      <h1>Travel</h1>
      <p className="post-meta">
        {photoTotal > 0
          ? `${photoTotal} photos, placed by machine — spin the globe, tap a glowing pin.`
          : "The places I’ve set the lamp down for a while — spin the globe."}
      </p>

      <TravelGlobeStage places={places}>
        <PlaceList places={places} />
      </TravelGlobeStage>
    </section>
  );
}
