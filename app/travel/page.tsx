import TravelGlobeStage from "@/components/travel/TravelGlobeStage";
import { PLACES } from "@/content/places";

export const metadata = {
  title: "Travel",
  description: "A globe of the places Jason has been."
};

// The place list, server-rendered and handed to the client stage as children so
// it is always in the HTML — crawlable, no-JS friendly, and the designed
// fallback for no-WebGL / reduced-motion visitors.
function PlaceList() {
  return (
    <ul className="travel-place-list">
      {PLACES.map((place) => (
        <li
          key={`${place.name}-${place.lat}-${place.lng}`}
          className="travel-place-card"
        >
          <div className="travel-place-card-head">
            <h3>{place.name}</h3>
            {place.region ? (
              <span className="travel-place-region">{place.region}</span>
            ) : null}
          </div>
          {place.note ? (
            <p className="travel-place-note">{place.note}</p>
          ) : null}
          {place.when ? (
            <p className="travel-place-when">{place.when}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function TravelPage() {
  return (
    <section className="section travel-section">
      <h1>Travel</h1>
      <p className="post-meta">
        The places I&rsquo;ve set the lamp down for a while &mdash; spin the
        globe.
      </p>

      <TravelGlobeStage>
        <PlaceList />
      </TravelGlobeStage>
    </section>
  );
}
