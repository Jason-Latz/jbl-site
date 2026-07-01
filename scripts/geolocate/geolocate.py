#!/usr/bin/env python3
"""Estimate where each travel photo was taken and write it to Supabase.

This is the "processes the images and makes an estimate" engine behind the
/travel globe. It runs LOCALLY and OFFLINE — no API key, no per-image cost:

  1. EXIF GPS      — if the photo carries GPS metadata, that's exact truth.
  2. Vision model  — otherwise an open-source CLIP model (StreetCLIP, the
                     geolocation-tuned CLIP; falls back to OpenAI CLIP ViT-L/14)
                     scores the pixels against Jason's own travel list and picks
                     the best match. Because the candidate set IS the list of
                     places he's been, every estimate lands somewhere plausible.

The chosen place's coordinates + a confidence are written back to public.photos
(latitude, longitude, geo_place, geo_region, geo_country, geo_confidence,
geo_source, geo_estimated_at). The globe reads those cached values — no ML at
request time.

Idempotent and re-runnable. Usage:
  python geolocate.py                 # place every photo, write to DB
  python geolocate.py --dry-run       # estimate + print, write nothing
  python geolocate.py --only-missing  # skip photos already placed
  python geolocate.py --report PATH   # write a JSON report of all placements
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
PLACES_JSON = REPO_ROOT / "content" / "places.json"
IMAGE_RE = (".avif", ".gif", ".heic", ".heif", ".jpg", ".jpeg", ".png", ".webp")

STREETCLIP = "geolocal/StreetCLIP"
FALLBACK_CLIP = "openai/clip-vit-large-patch14"

# Prompt templates ensembled per candidate place. Averaging several phrasings
# steadies the zero-shot signal versus a single prompt.
TEMPLATES = (
    "a photo taken in {name}, {country}",
    "a travel photograph from {name}",
    "a scene in {name}",
    "{name}, {country}",
)


def log(msg: str) -> None:
    print(msg, flush=True)


# --------------------------------------------------------------------------- env
def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    # real environment wins over the file
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


# ------------------------------------------------------------------------- geo
def haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    r = 6371.0
    dlat = math.radians(b_lat - a_lat)
    dlng = math.radians(b_lng - a_lng)
    s = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(a_lat))
        * math.cos(math.radians(b_lat))
        * math.sin(dlng / 2) ** 2
    )
    return 2 * r * math.asin(min(1.0, math.sqrt(s)))


def nearest_place(lat: float, lng: float, places: list[dict]):
    best, best_km = None, float("inf")
    for p in places:
        km = haversine_km(lat, lng, p["lat"], p["lng"])
        if km < best_km:
            best, best_km = p, km
    return best, best_km


def exif_gps(img: Image.Image):
    """Return (lat, lng) from EXIF GPS if present, else None."""
    try:
        exif = img.getexif()
        if not exif:
            return None
        gps = exif.get_ifd(0x8825)  # GPSInfo IFD
        if not gps:
            return None
        lat = gps.get(2)
        lat_ref = gps.get(1)
        lng = gps.get(4)
        lng_ref = gps.get(3)
        if not lat or not lng:
            return None

        def dms(v) -> float:
            d, m, s = (float(x) for x in v)
            return d + m / 60.0 + s / 3600.0

        latitude = dms(lat) * (-1 if str(lat_ref).upper().startswith("S") else 1)
        longitude = dms(lng) * (-1 if str(lng_ref).upper().startswith("W") else 1)
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            return None
        return latitude, longitude
    except Exception:
        return None


# ------------------------------------------------------------------------- clip
class GeoModel:
    def __init__(self, places: list[dict]):
        import torch  # noqa: WPS433
        from transformers import CLIPModel, CLIPProcessor

        self.torch = torch
        self.device = (
            "mps"
            if torch.backends.mps.is_available()
            else ("cuda" if torch.cuda.is_available() else "cpu")
        )
        model_id = STREETCLIP
        try:
            self.model = CLIPModel.from_pretrained(model_id)
            self.processor = CLIPProcessor.from_pretrained(model_id)
            self.model_id = model_id
        except Exception as exc:  # pragma: no cover - network/compat fallback
            log(f"  StreetCLIP unavailable ({exc}); falling back to {FALLBACK_CLIP}")
            self.model = CLIPModel.from_pretrained(FALLBACK_CLIP)
            self.processor = CLIPProcessor.from_pretrained(FALLBACK_CLIP)
            self.model_id = FALLBACK_CLIP
        self.model = self.model.to(self.device).eval()
        self.places = places
        self.text_features = self._build_text_features()

    def _build_text_features(self):
        torch = self.torch
        prompts: list[str] = []
        spans: list[tuple[int, int]] = []
        cursor = 0
        for p in self.places:
            name = p["name"]
            country = p.get("country") or p.get("region") or name
            local: list[str] = []
            for t in TEMPLATES:
                text = t.format(name=name, country=country)
                # collapse "Australia, Australia" style repeats
                text = text.replace(f"{name}, {name}", name)
                local.append(text)
            prompts.extend(local)
            spans.append((cursor, cursor + len(local)))
            cursor += len(local)

        # Use the full CLIP forward — its CLIPOutput.text_embeds are the
        # projected, L2-normalized shared-space embeddings (stable across
        # transformers versions, unlike get_text_features). A dummy image is
        # required by the joint processor but its output is ignored.
        dummy = Image.new("RGB", (336, 336))
        inputs = self.processor(
            text=prompts,
            images=dummy,
            return_tensors="pt",
            padding=True,
            truncation=True
        ).to(self.device)
        with torch.no_grad():
            feats = self.model(**inputs).text_embeds
        # mean-pool the templates per place, renormalize
        pooled = []
        for start, end in spans:
            v = feats[start:end].mean(dim=0)
            v = v / v.norm()
            pooled.append(v)
        return torch.stack(pooled)  # (num_places, dim)

    def estimate(self, img: Image.Image, top_k: int = 3):
        torch = self.torch
        inputs = self.processor(
            text=["x"], images=img, return_tensors="pt", padding=True
        ).to(self.device)
        with torch.no_grad():
            feat = self.model(**inputs).image_embeds
        logit_scale = self.model.logit_scale.exp()
        logits = (logit_scale * feat @ self.text_features.T).squeeze(0)
        probs = logits.softmax(dim=-1).detach().cpu()
        order = probs.argsort(descending=True)
        ranked = [
            {
                "name": self.places[i]["name"],
                "confidence": float(probs[i]),
            }
            for i in order[:top_k].tolist()
        ]
        best_i = int(order[0])
        return self.places[best_i], float(probs[best_i]), ranked


# --------------------------------------------------------------------- supabase
def storage_public_url(base: str, bucket: str, path: str) -> str:
    encoded = "/".join(requests.utils.quote(seg, safe="") for seg in path.split("/"))
    return f"{base}/storage/v1/object/public/{bucket}/{encoded}"


def list_photos(client) -> list[str]:
    files = client.storage.from_("photos").list(
        "", {"limit": 2000, "offset": 0, "sortBy": {"column": "created_at", "order": "desc"}}
    )
    return [f["name"] for f in files if f.get("name", "").lower().endswith(IMAGE_RE)]


def already_placed(client) -> set[str]:
    rows = client.table("photos").select("storage_path,latitude").execute().data or []
    return {r["storage_path"] for r in rows if r.get("latitude") is not None}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only-missing", action="store_true")
    ap.add_argument("--report", default="")
    ap.add_argument("--cache", default=str(REPO_ROOT / ".geo-cache"))
    args = ap.parse_args()

    env = load_env()
    base = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        log("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
        return 1

    from supabase import create_client

    client = create_client(base, key)
    places = json.loads(PLACES_JSON.read_text())
    log(f"Loaded {len(places)} candidate places from {PLACES_JSON.name}")

    names = list_photos(client)
    log(f"Found {len(names)} photos in the bucket")
    skip = already_placed(client) if args.only_missing else set()

    cache_dir = Path(args.cache)
    cache_dir.mkdir(parents=True, exist_ok=True)

    log("Loading vision model (first run downloads weights)...")
    model = GeoModel(places)
    log(f"Model ready: {model.model_id} on {model.device}")

    report: list[dict] = []
    placed = 0
    for i, name in enumerate(names, 1):
        if name in skip:
            log(f"[{i}/{len(names)}] {name} — already placed, skip")
            continue
        url = storage_public_url(base, "photos", name)
        cache_path = cache_dir / name.replace("/", "_")
        try:
            if cache_path.exists():
                data = cache_path.read_bytes()
            else:
                data = requests.get(url, timeout=60).content
                cache_path.write_bytes(data)
            img = Image.open(cache_path).convert("RGB")
        except Exception as exc:
            log(f"[{i}/{len(names)}] {name} — download/open failed: {exc}")
            continue

        gps = exif_gps(Image.open(cache_path))
        if gps:
            lat, lng = gps
            place, km = nearest_place(lat, lng, places)
            source, confidence = "exif", 1.0
            ranked = [{"name": place["name"], "confidence": 1.0}]
            place_name = place["name"] if km < 250 else None
            region = place.get("region") if place_name else None
            country = place.get("country") if place_name else None
        else:
            place, confidence, ranked = model.estimate(img)
            lat, lng = place["lat"], place["lng"]
            source = "ai"
            place_name, region, country = (
                place["name"],
                place.get("region"),
                place.get("country"),
            )

        row = {
            "storage_path": name,
            "latitude": round(lat, 6),
            "longitude": round(lng, 6),
            "geo_place": place_name,
            "geo_region": region,
            "geo_country": country,
            "geo_confidence": round(confidence, 4),
            "geo_source": source,
            "geo_estimated_at": datetime.now(timezone.utc).isoformat(),
        }
        report.append({**row, "url": url, "top": ranked})
        top_str = ", ".join(f"{r['name']} {r['confidence']*100:.0f}%" for r in ranked)
        log(
            f"[{i}/{len(names)}] {name} -> {place_name or f'{lat:.3f},{lng:.3f}'} "
            f"({source}, {confidence*100:.0f}%)  [{top_str}]"
        )

        if not args.dry_run:
            client.table("photos").upsert(row, on_conflict="storage_path").execute()
            placed += 1
        time.sleep(0.02)

    log(f"\nDone. {placed} photos written{' (dry-run: 0)' if args.dry_run else ''}.")
    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=2))
        log(f"Report -> {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
