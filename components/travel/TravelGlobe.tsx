"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PLACES } from "@/content/places";
import type { GlobePlace } from "@/lib/travelGlobe";
import { LAND_RINGS } from "@/lib/geo/land";
import { makeCanvasTexture } from "@/lib/three/materials";
import type { SiteTheme } from "@/components/desk/useSiteTheme";

// ---------------------------------------------------------------------------
// The travel globe — a warm paper-and-ink sphere of the places Jason has been,
// in the homepage desk's lamplit palette. The land is drawn once into an
// equirectangular CanvasTexture (no satellite imagery); coral markers sit on
// each place; a fresnel rim makes the globe glow at its edge; thin coral arcs
// thread the places in order. Auto-rotates gently, pauses on drag/selection.
// All colours are baked per-theme so the scene reads great in light and dark.
// ---------------------------------------------------------------------------

const GLOBE_RADIUS = 1;
// 2048x1024 is plenty: the map is stylized vector art (gradient ocean,
// graticule, simplified land rings) and the globe is never viewed near 1:1, so
// 4k bought ~45 MB of VRAM (90 MB transient on a theme swap) for no visible
// gain — a real cost on weak GPUs. anisotropy 8 keeps the rim crisp.
const TEX_W = 2048;
const TEX_H = 1024;

// Per-theme ink. Light = warm cream paper on near-black walnut ocean; dark
// deepens the ocean and cools the land a touch so coral still pops.
type GlobePalette = {
  ocean: string;
  oceanDeep: string;
  land: string;
  landShade: string;
  coast: string;
  graticule: string;
  fresnel: THREE.Color;
  fresnelIntensity: number;
  background: THREE.Color;
  ambient: number;
  key: number;
  marker: string;
  arc: string;
};

function paletteFor(theme: SiteTheme): GlobePalette {
  if (theme === "dark") {
    return {
      ocean: "#1c130b",
      oceanDeep: "#120c06",
      land: "#d8c39a",
      landShade: "#b89f74",
      coast: "#8a6b45",
      graticule: "rgba(214, 188, 142, 0.07)",
      fresnel: new THREE.Color("#d97757"),
      // Additive coral pops hard on the near-black night bg, so the night rim
      // sits lower than the day's (which is a cream glow on cream — barely there).
      fresnelIntensity: 0.32,
      background: new THREE.Color("#140d08"),
      ambient: 0.55,
      key: 1.05,
      marker: "#d97757",
      arc: "#d97757"
    };
  }
  return {
    ocean: "#241710",
    oceanDeep: "#1a100a",
    land: "#efe2c6",
    landShade: "#dcc9a4",
    coast: "#b08a5c",
    graticule: "rgba(60, 40, 22, 0.10)",
    fresnel: new THREE.Color("#c75833"),
    fresnelIntensity: 0.4,
    background: new THREE.Color("#efe4cf"),
    ambient: 0.62,
    key: 1.25,
    marker: "#c75833",
    arc: "#c75833"
  };
}

// Equirectangular projection of a [lon, lat] degree pair onto the canvas:
//   x = (lon + 180) / 360 * W   (lon -180..180 → 0..W)
//   y = (90 - lat) / 180 * H    (lat  90..-90 → 0..H, north at top)
function lonToX(lon: number): number {
  return ((lon + 180) / 360) * TEX_W;
}
function latToY(lat: number): number {
  return ((90 - lat) / 180) * TEX_H;
}

// Build the world map once into an offscreen canvas → CanvasTexture. Ocean
// fill, graticule, then every land ring filled as cream paper with a soft
// coastline stroke. Returns a texture the sphere's MeshStandardMaterial maps.
function makeGlobeTexture(palette: GlobePalette): THREE.CanvasTexture {
  return makeCanvasTexture(TEX_W, TEX_H, (ctx, w, h) => {
    // Ocean — a faint vertical gradient (deeper toward the poles) keeps the
    // matte fill from looking like flat plastic.
    const ocean = ctx.createLinearGradient(0, 0, 0, h);
    ocean.addColorStop(0, palette.oceanDeep);
    ocean.addColorStop(0.5, palette.ocean);
    ocean.addColorStop(1, palette.oceanDeep);
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, w, h);

    // Graticule — meridians every 30°, parallels every 30°. Very low contrast,
    // drawn under the land so coastlines sit cleanly on top.
    ctx.strokeStyle = palette.graticule;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = lonToX(lon);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = latToY(lat);
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Land — fill each ring as a path, then trace a soft coastline. Rings that
    // wrap the antimeridian render fine as raw paths here (a hairline seam at
    // ±180 is invisible at this scale and on the back of the globe).
    ctx.lineJoin = "round";
    for (const ring of LAND_RINGS) {
      if (ring.length < 3) continue;
      ctx.beginPath();
      for (let i = 0; i < ring.length; i++) {
        const x = lonToX(ring[i][0]);
        const y = latToY(ring[i][1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = palette.land;
      ctx.fill();
      ctx.strokeStyle = palette.coast;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // A whisper of inland shading: faint horizontal streaks over the land mass
    // keep the paper warm without a second texture. Cheap, additive feel.
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = palette.landShade;
    for (let i = 0; i < 120; i++) {
      const y = Math.random() * h;
      ctx.fillRect(0, y, w, 1);
    }
    ctx.globalAlpha = 1;
  });
}

// lat/lng → unit-sphere point. The texture's seam (canvas x=0) is lon = -180,
// and three's equirect map wrapping starts the texture's left edge at theta=0
// on +X spinning toward +Z. Matching the texture build above:
//   phi   = (90 - lat) * π/180     (polar angle from +Y)
//   theta = (lon + 180) * π/180    (so lon -180 → theta 0, aligning the seam)
//   x = -r·sin(phi)·cos(theta)
//   z =  r·sin(phi)·sin(theta)
//   y =  r·cos(phi)
// Verified by eye: Edinburgh lands on Scotland, Austin in Texas, D.C. on the
// US east coast — i.e. the marker math and the texture share one longitude
// origin. (This longitude offset is the load-bearing correctness assumption.)
function latLngToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// Soft radial halo for the marker sprite — a coral dot that fades to nothing.
function makeHaloTexture(color: string): THREE.CanvasTexture {
  const size = 128;
  const tex = makeCanvasTexture(
    size,
    size,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(
        w / 2,
        h / 2,
        0,
        w / 2,
        h / 2,
        w / 2
      );
      const c = new THREE.Color(color);
      const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
      g.addColorStop(0, `rgba(${rgb}, 0.9)`);
      g.addColorStop(0.25, `rgba(${rgb}, 0.55)`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { srgb: true }
  );
  return tex;
}

// Fresnel rim: a back-side sphere a hair larger than the globe whose alpha
// rises toward the silhouette, so the planet glows warmly at its edge. Cheap
// hand-written shader — no postprocessing needed.
const fresnelVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const fresnelFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = 1.0 - max(dot(vNormal, vView), 0.0);
    rim = pow(rim, uPower);
    gl_FragColor = vec4(uColor, rim * uIntensity);
  }
`;

function Atmosphere({ palette }: { palette: GlobePalette }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: palette.fresnel.clone() },
          // A whisper of warmth hugging the silhouette — not a corona. A higher
          // power pulls the glow tight to the rim; low intensity keeps it from
          // blooming into a ring (which it did at 0.9/3.2/scale-1.18).
          uIntensity: { value: palette.fresnelIntensity },
          uPower: { value: 4.5 }
        },
        vertexShader: fresnelVertex,
        fragmentShader: fresnelFragment,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
      }),
    [palette.fresnel, palette.fresnelIntensity]
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material} scale={1.08}>
      <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
    </mesh>
  );
}

// One place marker: a glowing coral dot with a pulsing halo and a thin stem
// rising off the surface. Home places render larger/brighter. Hover scales +
// brightens; click selects.
function Marker({
  place,
  palette,
  selected,
  onSelect
}: {
  place: GlobePlace;
  palette: GlobePalette;
  selected: boolean;
  onSelect: (key: string | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Sprite>(null);
  const dotRef = useRef<THREE.Mesh>(null);
  const hoverRef = useRef(false);
  const facingTmp = useMemo(() => new THREE.Vector3(), []);

  // The opaque globe sphere carries no pointer handlers, so R3F's raycast
  // passes straight through it and can hit a marker on the FAR (hidden)
  // hemisphere. Reject those: a marker faces the camera when the camera sits on
  // the outward side of its surface tangent — dot(worldPos, cam) > |worldPos|².
  const facesCamera = (camera: THREE.Camera): boolean => {
    const g = groupRef.current;
    if (!g) return true;
    g.getWorldPosition(facingTmp);
    return facingTmp.dot(camera.position) - facingTmp.lengthSq() > 0;
  };

  const position = useMemo(
    () => latLngToVec3(place.lat, place.lng, GLOBE_RADIUS),
    [place.lat, place.lng]
  );
  // Surface normal at the marker — orients the stem outward and seats the dot
  // just above the paper.
  const normal = useMemo(() => position.clone().normalize(), [position]);
  // Photo pins are the stars — tallest + biggest dot; home a touch up; context
  // markers small and quiet so the globe still shows the whole travel story.
  const prominent = place.hasPhotos;
  const stemLen = prominent ? 0.135 : place.home ? 0.1 : 0.07;
  const baseDot = prominent ? 0.03 : place.home ? 0.022 : 0.015;

  const halo = useMemo(() => makeHaloTexture(palette.marker), [palette.marker]);
  useEffect(() => () => halo.dispose(), [halo]);

  const dotMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(palette.marker),
        toneMapped: false
      }),
    [palette.marker]
  );
  useEffect(() => () => dotMaterial.dispose(), [dotMaterial]);

  const haloMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: halo,
        color: new THREE.Color(palette.marker),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      }),
    [halo, palette.marker]
  );
  useEffect(() => () => haloMaterial.dispose(), [haloMaterial]);

  // Stem geometry: a thin cylinder from surface to dot, oriented along the
  // local normal. Built once; the group is rotated to align +Y with normal.
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    return q;
  }, [normal]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const hovered = hoverRef.current;
    const emphasis = selected || hovered;
    // Halo breathes; selection/hover swells and brightens it.
    if (haloRef.current) {
      const pulse = 1 + Math.sin(t * 2 + place.lng) * 0.12;
      const base = (prominent ? 0.2 : place.home ? 0.15 : 0.1) * pulse;
      const scale = emphasis ? base * 1.45 : base;
      haloRef.current.scale.setScalar(scale);
      haloMaterial.opacity = emphasis ? 0.95 : selected ? 0.85 : 0.6;
    }
    if (dotRef.current) {
      const s = emphasis ? 1.4 : 1;
      dotRef.current.scale.setScalar(s);
    }
  });

  return (
    <group
      ref={groupRef}
      position={position.toArray()}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (!facesCamera(event.camera)) return;
        event.stopPropagation();
        onSelect(place.key);
      }}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        if (!facesCamera(event.camera)) return;
        event.stopPropagation();
        hoverRef.current = true;
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hoverRef.current = false;
        document.body.style.cursor = "auto";
      }}
    >
      {/* Stem: base at surface, growing outward along the normal. */}
      <group quaternion={quaternion}>
        <mesh position={[0, stemLen / 2, 0]}>
          <cylinderGeometry args={[0.0035, 0.0035, stemLen, 6]} />
          <meshBasicMaterial color={palette.marker} toneMapped={false} />
        </mesh>
      </group>
      {/* Dot floats at the stem tip. */}
      <mesh
        ref={dotRef}
        position={normal.clone().multiplyScalar(stemLen).toArray()}
        material={dotMaterial}
      >
        <sphereGeometry args={[baseDot, 16, 16]} />
      </mesh>
      <sprite
        ref={haloRef}
        position={normal.clone().multiplyScalar(stemLen).toArray()}
        material={haloMaterial}
      />
    </group>
  );
}

// A translucent coral great-circle arc between two places. The arc bows off the
// surface (slerp of the two surface points, lifted by a sine envelope) so it
// reads as a flight path rather than a chord through the planet.
function buildArcPoints(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
  const segments = 48;
  const points: THREE.Vector3[] = [];
  const start = a.clone().normalize();
  const end = b.clone().normalize();
  const angle = start.angleTo(end);
  // Two places at (nearly) the same coordinates have no arc between them —
  // without this the 1/sin(angle) slerp collapses to a line through the globe
  // center. places.ts invites adding entries, so guard the colocated case.
  if (angle < 1e-4) return [];
  // Higher lift for longer hops, so a transatlantic arc arcs higher than a
  // hop between two US cities.
  const maxLift = 0.12 + angle * 0.14;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = new THREE.Vector3()
      .copy(start)
      .multiplyScalar(Math.sin((1 - t) * angle))
      .addScaledVector(end, Math.sin(t * angle))
      .multiplyScalar(angle === 0 ? 1 : 1 / Math.sin(angle));
    const lift = 1 + Math.sin(t * Math.PI) * maxLift;
    point.multiplyScalar(GLOBE_RADIUS * lift);
    points.push(point);
  }
  return points;
}

function Arcs({
  palette,
  places
}: {
  palette: GlobePalette;
  places: GlobePlace[];
}) {
  const { lines, geometries, material } = useMemo(() => {
    // Thread the journey through the places that actually have photos, in the
    // gazetteer's (roughly chronological) order — so the arcs read as a trip,
    // not a tangle across every context marker.
    const order = new Map(PLACES.map((p, i) => [p.name, i]));
    const journey = places
      .filter((p) => p.hasPhotos)
      .sort((a, b) => (order.get(a.name) ?? 999) - (order.get(b.name) ?? 999));
    const surfacePoints = journey.map((p) =>
      latLngToVec3(p.lat, p.lng, GLOBE_RADIUS)
    );
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(palette.arc),
      transparent: true,
      opacity: 0.42,
      toneMapped: false
    });
    const geometries: THREE.BufferGeometry[] = [];
    const lines: THREE.Line[] = [];
    for (let i = 0; i < surfacePoints.length - 1; i++) {
      const pts = buildArcPoints(surfacePoints[i], surfacePoints[i + 1]);
      if (pts.length < 2) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints(pts);
      geometries.push(geometry);
      lines.push(new THREE.Line(geometry, material));
    }
    return { lines, geometries, material };
  }, [palette.arc, places]);

  useEffect(
    () => () => {
      geometries.forEach((g) => g.dispose());
      material.dispose();
    },
    [geometries, material]
  );

  return (
    <>
      {lines.map((line, i) => (
        // Pre-built THREE.Line objects (geometry + shared material), wrapped as
        // R3F primitives so they reconcile only when the theme palette changes.
        <primitive key={i} object={line} />
      ))}
    </>
  );
}

// The textured sphere itself. Material is rebuilt per-theme; the old texture is
// disposed on swap so we never leak a 4k canvas.
function GlobeSphere({ palette }: { palette: GlobePalette }) {
  const material = useMemo(() => {
    const texture = makeGlobeTexture(palette);
    texture.anisotropy = 8;
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      metalness: 0.0
    });
  }, [palette]);

  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material]
  );

  return (
    <mesh material={material}>
      <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
    </mesh>
  );
}

// The spinning group: holds the globe, atmosphere, markers and arcs and applies
// the gentle auto-rotate. Rotation pauses while the user is dragging or has a
// place selected, and eases back to spinning afterward.
function GlobeGroup({
  palette,
  places,
  selectedKey,
  onSelect,
  draggingRef
}: {
  palette: GlobePalette;
  places: GlobePlace[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  draggingRef: React.MutableRefObject<boolean>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const speedRef = useRef(0);
  // The selection we have already flown to — once reached, the user can orbit
  // the globe freely without it snapping back to the pin.
  const settledKeyRef = useRef<string | null>(null);
  const selected = places.find((p) => p.key === selectedKey) ?? null;

  // The Y-rotation that brings the selected place to the front (facing +Z).
  const targetY = useMemo(() => {
    if (!selected) return null;
    const pos = latLngToVec3(selected.lat, selected.lng, GLOBE_RADIUS);
    return -Math.atan2(pos.x, pos.z);
  }, [selected]);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const flying =
      targetY !== null && settledKeyRef.current !== selectedKey && !draggingRef.current;
    if (flying) {
      // Fly-to: stop the spin and rotate the picked place to the front, taking
      // the shortest way round (signed angle wrapped into [-π, π]). Mark the
      // selection settled once it arrives so dragging afterward is free.
      speedRef.current = 0;
      const twoPi = Math.PI * 2;
      const diff =
        (((targetY - group.rotation.y) % twoPi) + twoPi + Math.PI) % twoPi -
        Math.PI;
      group.rotation.y += diff * (1 - Math.pow(0.0025, delta));
      if (Math.abs(diff) < 0.01) settledKeyRef.current = selectedKey;
    } else if (selected) {
      // Selected and settled (or mid-drag): hold position — no auto-spin, and
      // let OrbitControls move the camera freely.
      speedRef.current = 0;
    } else {
      // Nothing selected: auto-rotate unless the user is dragging. Ease toward
      // the target so pausing/resuming glides rather than snaps.
      settledKeyRef.current = null;
      const target = draggingRef.current ? 0 : 0.12;
      speedRef.current = THREE.MathUtils.lerp(
        speedRef.current,
        target,
        1 - Math.pow(0.001, delta)
      );
      group.rotation.y += speedRef.current * delta;
    }
  });

  return (
    <group ref={groupRef}>
      <GlobeSphere palette={palette} />
      <Atmosphere palette={palette} />
      <Arcs palette={palette} places={places} />
      {places.map((place) => (
        <Marker
          key={place.key}
          place={place}
          palette={palette}
          selected={selectedKey === place.key}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

// Warm lighting + theme-driven background. A single key from the upper-left
// gives the sphere form; low ambient keeps the night side from going black.
function SceneRig({ palette }: { palette: GlobePalette }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = palette.background;
  }, [scene, palette.background]);
  return (
    <>
      <ambientLight intensity={palette.ambient} color="#fff1dd" />
      <directionalLight
        position={[-2.5, 2, 2.5]}
        intensity={palette.key}
        color="#ffe7c4"
      />
      <directionalLight
        position={[2.5, -1, -1.5]}
        intensity={palette.key * 0.25}
        color="#cfe0f4"
      />
    </>
  );
}

export type TravelGlobeProps = {
  theme: SiteTheme;
  places: GlobePlace[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
};

export default function TravelGlobe({
  theme,
  places,
  selectedKey,
  onSelect
}: TravelGlobeProps) {
  const palette = useMemo(() => paletteFor(theme), [theme]);
  // Live drag state — read in GlobeGroup's useFrame to pause auto-rotate
  // without forcing a React re-render mid-drag.
  const draggingRef = useRef(false);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 38, near: 0.1, far: 100, position: [0, 0.2, 3.7] }}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping
      }}
      // Clicking empty space (ocean / off-globe) clears the selection.
      onPointerMissed={() => onSelect(null)}
    >
      <SceneRig palette={palette} />
      <GlobeGroup
        palette={palette}
        places={places}
        selectedKey={selectedKey}
        onSelect={onSelect}
        draggingRef={draggingRef}
      />
      <OrbitControls
        enablePan={false}
        enableZoom
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        minDistance={1.6}
        maxDistance={5}
        onStart={() => {
          draggingRef.current = true;
        }}
        onEnd={() => {
          draggingRef.current = false;
        }}
      />
    </Canvas>
  );
}
