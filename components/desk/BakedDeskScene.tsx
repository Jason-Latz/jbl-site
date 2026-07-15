"use client";

// The BAKED homepage scene — a drop-in for DeskScene with the same props/HUD
// contract, but the lighting is frozen-dried: it loads the world-space uv1 GLB
// and lights every static surface with a baked lightmap (diffuse GI) crossfaded
// by the lamp, plus an Environment for specular/chrome. No shadow maps, no AO,
// no IBL warm-up — the expensive real-time GI is gone, the beauty (env specular,
// lamp beam, bloom, grain, vignette) stays. Clicks dispatch off each baked
// mesh's `object` tag (turntable, macbook, …) to the same focus views.
//
// First pass: the scene is STATIC (chess/tonearm/lid are baked in rest pose).
// Dynamic objects layer back on top later. The live DeskScene remains the
// fallback until this is signed off.

import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { GLTFLoader } from "three-stdlib";
// three-stdlib's MeshoptDecoder export is the wrong shape (a bare function with
// no decodeGltfBuffer/ready); three's own module is the canonical singleton the
// GLTFLoader expects. The slim GLB is EXT_meshopt_compression-encoded.
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  Noise,
  SMAA,
  Vignette
} from "@react-three/postprocessing";
import { DeskThemeProvider, useDeskTheme } from "./DeskThemeContext";
import { useSiteTheme } from "./useSiteTheme";
import { CAMERA, FOCUS_VIEWS, PLACEMENT, type FocusId } from "./layout";
import LampBeam from "./objects/LampBeam";
import MacBook from "./objects/MacBook";
import ChessboardBase from "./objects/Chessboard";
import NotepadBase from "./objects/Notepad";
import TurntableBase from "./objects/Turntable";
import { lampGlowRef } from "./objects/DeskLamp";
import MoonBeam, { moonGlowRef } from "./objects/MoonBeam";
import type { DeskSceneProps } from "./DeskScene";

// Memoized like DeskScene's: a theme/poll re-render must not re-reconcile these
// objects' hundreds of R3F elements unless their own props actually changed.
const Chessboard = memo(ChessboardBase);
const Notepad = memo(NotepadBase);
const Turntable = memo(TurntableBase);

// Slim baked assets (meshopt GLB + WebP lightmaps, ~31MB) are hosted on public
// Supabase Storage under an immutable, versioned prefix. Local dev serves the
// same slim assets from disk so reloads don't refetch 28MB. NEXT_PUBLIC_BAKE_
// CDN_URL overrides both (set it in Vercel to repoint without a code change).
// Bump the v1 prefix on a re-bake — see docs/BAKING.md.
const SUPABASE_BAKE_CDN =
  "https://qllalbklzxtsvqzszigo.supabase.co/storage/v1/object/public/bake/v1";
const isLocalhost =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
const BAKE_BASE =
  process.env.NEXT_PUBLIC_BAKE_CDN_URL ||
  (isLocalhost ? "/_bake/cdn" : SUPABASE_BAKE_CDN);
const GLB_URL = `${BAKE_BASE}/desk-window-uv1.glb`;

// Reveal backstop: if a lightmap or a shader compile stalls, don't hold the
// poster past this. The poster is a designed view, so a generous cap is fine.
const BAKED_READY_TIMEOUT_MS = 8000;

// Baked meshes hidden because a LIVE component overlays them (their baked
// contact shadow stays painted on the desk lightmap to ground the overlay).
const HIDDEN = new Set(["macbook", "chessboard", "turntable", "notepad"]);

// Which baked object maps to which focus view. Lamp is special (theme toggle);
// macbook/chessboard/turntable/notepad are owned by their live overlays below,
// not routed off the baked tag. The turntable, like DeskScene, has NO
// body-click focus — its needle owns the only interaction (drop → records view).
const FOCUS_MAP: Record<string, FocusId> = {
  bookRow: "reading"
};

// Baked objects that navigate to a real route instead of opening a focus panel.
// The film camera and the fanned prints are the "photography" corner of the
// desk — clicking either crosses to the photo gallery (mirrors DeskScene).
const NAV_MAP: Record<string, string> = {
  filmCamera: "/photography",
  photos: "/photography"
};

const CAMERA_START = new THREE.Vector3(...CAMERA.start);
const CAMERA_REST = new THREE.Vector3(...CAMERA.rest);
const CAMERA_TARGET = new THREE.Vector3(...CAMERA.target);
// Portrait (phone) framing: a tall screen sees only a narrow horizontal slice at
// the landscape fov (40 vertical leaves ~19 horizontal on a ~0.46 aspect), so
// the wide desk can't read whole. Rather than hero one corner (which buried the
// books + chess off the right edge), center the target and pull the rest camera
// back with a wider fov so the WHOLE desk — turntable through chessboard — reads
// in the tall frame. Kept in sync with DeskScene's portrait rig so ?baked=0
// frames identically.
const PORTRAIT_START = new THREE.Vector3(0.2, 1.5, 2.6);
const PORTRAIT_REST = new THREE.Vector3(0.02, 0.98, 2.05);
const PORTRAIT_TARGET = new THREE.Vector3(0.0, 0.13, -0.06);
const PORTRAIT_FOV = 58;

// ——— two-state lightmap blend, driven by the real theme mix ———
const uMix = { value: 1 };
// Lifts the baked OFF (moonlit) lightmap so the night room reads without
// washing flat; the baked lightmap holds the moon's direction, MoonAmbient adds
// cool fill, MoonBeam draws the shaft. 0.85 (was 2.0 -> 1.8 -> 1.45): Jason
// wanted the night "quite a lot" darker, so the baked night base now sits BELOW
// unity — a dim, moody moonlit room rather than a lit one. Still well above
// black, so the desk stays readable as moonlit.
const uOffBoost = { value: 0.85 };

// Lamp local axis (matches BakeScene's LAMP_HEAD/TARGET_LOCAL).
const LAMP_HEAD_LOCAL: [number, number, number] = [0.3446, 0.4195, 0.0088];
const LAMP_TARGET_LOCAL: [number, number, number] = [0.5, 0, 0.12];

const texLoader = new THREE.TextureLoader();
// Supabase serves the lightmaps cross-origin with `access-control-allow-origin:
// *`; anonymous CORS keeps the canvas untainted so preserveDrawingBuffer
// captures still work. (Three defaults to anonymous, but be explicit.)
texLoader.crossOrigin = "anonymous";

// A 1x1 stand-in for a lightmap slot whose real map hasn't loaded yet. On uv1
// (channel 1) like the real maps so it drives the same vLightMapUv varying;
// black is harmless because the placeholder slot always sits at zero mix weight
// for the active theme (the off slot at mix=1, the on slot at mix=0).
const PLACEHOLDER_LM = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.channel = 1;
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.needsUpdate = true;
  return t;
})();

// Per-key lightmap cache with load tracking. `loaded` flips once the WebP has
// decoded; `waiters` fire on load — used both to gate the reveal on the active
// set and to swap a deferred off-theme map into an already-patched material.
// Module-level, so it survives dev remounts.
type LightmapEntry = {
  tex: THREE.Texture;
  loaded: boolean;
  waiters: Array<() => void>;
};
const lmEntries = new Map<string, LightmapEntry>();

function acquireLightmap(
  unit: string,
  state: "on" | "off",
  onLoad?: () => void
): THREE.Texture {
  const key = `${unit}-${state}`;
  const existing = lmEntries.get(key);
  if (existing) {
    if (existing.loaded) onLoad?.();
    else if (onLoad) existing.waiters.push(onLoad);
    return existing.tex;
  }
  const entry: LightmapEntry = {
    tex: undefined as unknown as THREE.Texture,
    loaded: false,
    waiters: onLoad ? [onLoad] : []
  };
  // 8-bit WebP — the runtime decoded the source 16-bit PNGs to 8-bit via <img>
  // anyway, so this is lossless vs. what shipped, at ~1/30th the bytes.
  entry.tex = texLoader.load(`${BAKE_BASE}/lightmaps/${key}.webp`, () => {
    entry.loaded = true;
    const waiters = entry.waiters.splice(0);
    for (const fn of waiters) fn();
  });
  entry.tex.flipY = false;
  entry.tex.channel = 1;
  entry.tex.colorSpace = THREE.LinearSRGBColorSpace;
  lmEntries.set(key, entry);
  return entry.tex;
}

function lightmapLoaded(key: string): boolean {
  return lmEntries.get(key)?.loaded ?? false;
}

// Filled while attaching materials during the GLB traverse: the lightmapped
// unit names the reveal gates on (the gate derives per-theme keys from these
// at check time, so a mid-load theme flip re-targets the wait), and the
// closures that load the OTHER theme's maps once the scene is revealed.
type BakeLoadCtx = {
  units: string[];
  deferred: Array<() => void>;
};

// Both lightmap slots read from custom uniforms so either map can be swapped in
// later by mutating a uniform's `.value` (a bare reassignment of
// material.lightMap isn't reliably re-read each frame). `lightMap` is still set
// (to the active map or the placeholder) only to enable the lightmap chunk and
// put vLightMapUv on uv1; the actual sampling reads lightMapOn / lightMapOff.
// Only the ACTIVE theme's map is fetched up front; the other is deferred to
// after the reveal (ctx.deferred), which roughly halves the blocking requests.
function attachBakedLightmap(
  mat: THREE.MeshStandardMaterial,
  unit: string,
  activeState: "on" | "off",
  ctx: BakeLoadCtx
) {
  const inactiveState = activeState === "on" ? "off" : "on";
  const activeTex = acquireLightmap(unit, activeState);
  ctx.units.push(unit);

  const onUniform = { value: activeState === "on" ? activeTex : PLACEHOLDER_LM };
  const offUniform = {
    value: activeState === "off" ? activeTex : PLACEHOLDER_LM
  };

  mat.lightMap = activeState === "on" ? activeTex : PLACEHOLDER_LM;
  mat.lightMapIntensity = Math.PI;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lightMapOn = onUniform;
    shader.uniforms.lightMapOff = offUniform;
    shader.uniforms.uMix = uMix;
    shader.uniforms.uOffBoost = uOffBoost;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        /void main\(\)\s*\{/,
        "uniform sampler2D lightMapOn;\nuniform sampler2D lightMapOff;\nuniform float uMix;\nuniform float uOffBoost;\nvoid main() {"
      )
      .replace(
        "vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );",
        "vec4 lightMapTexel = mix( texture2D( lightMapOff, vLightMapUv ) * uOffBoost, texture2D( lightMapOn, vLightMapUv ), uMix );"
      );
  };
  mat.needsUpdate = true;

  // Deferred: after the reveal, load the other theme's map and drop it into the
  // matching uniform so a later lamp toggle crossfades to a real map, not the
  // placeholder. Idempotent — acquireLightmap caches.
  ctx.deferred.push(() => {
    acquireLightmap(unit, inactiveState, () => {
      const tex = lmEntries.get(`${unit}-${inactiveState}`)?.tex;
      if (!tex) return;
      if (inactiveState === "on") onUniform.value = tex;
      else offUniform.value = tex;
    });
  });
}

function BakedStatics({
  onFocus,
  onReady
}: {
  onFocus: (id: FocusId) => void;
  onReady?: () => void;
}) {
  const { theme, toggleTheme } = useDeskTheme();
  const router = useRouter();
  const [root, setRoot] = useState<THREE.Object3D | null>(null);

  // The theme at parse time decides which lightmap set is "active" (fetched
  // before the reveal). A ref keeps it current without re-running the GLB load.
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Shared load bookkeeping. `ctx` is filled during the traverse; `parsed`
  // flips once the GLB is in hand; the deferred off-theme fetch runs at most
  // once.
  const parsedRef = useRef(false);
  const ctxRef = useRef<BakeLoadCtx>({ units: [], deferred: [] });
  const deferredStartedRef = useRef(false);

  // Reveal-signal bookkeeping (mirrors DeskScene's ReadySignal): compile the
  // graph and draw a few frames before the canvas crossfades in over the
  // poster.
  const { gl, scene, camera } = useThree();
  const startedAtRef = useRef(0);
  const framesRef = useRef(0);
  const compileStartedRef = useRef(false);
  const compiledRef = useRef(false);
  const firedRef = useRef(false);

  const runDeferred = useCallback(() => {
    if (deferredStartedRef.current) return;
    deferredStartedRef.current = true;
    const jobs = ctxRef.current.deferred.splice(0);
    for (const job of jobs) job();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      GLB_URL,
      (gltf) => {
        if (cancelled) return;
        // The reveal backstop clock starts HERE, at parse — not at mount. The
        // 29MB GLB alone can take >8s on a cold connection; a mount-anchored
        // clock would already be expired when the gate first runs, skipping
        // both the lightmap wait and the compile wait and reproducing the
        // half-lit reveal this gate exists to prevent. Anchored at parse, the
        // timeout measures only the lightmap+compile phase it's meant to cap.
        startedAtRef.current = performance.now();
        // Active state = the map the current theme actually shows: lamp-on
        // ("on") in light, moonlit ("off") in dark.
        const activeState = themeRef.current === "dark" ? "off" : "on";
        const ctx = ctxRef.current;
        gltf.scene.traverse((o) => {
          // Hide every baked mesh whose object has a live overlay (frozen shut
          // macbook, frozen-position chessboard) — mirror objectOf()'s
          // self-or-parent tag resolution.
          const tag =
            (o.userData?.object as string) ||
            (o.parent?.userData?.object as string) ||
            "";
          if (HIDDEN.has(tag)) o.visible = false;
          // The exported GLB carries each object's three.js lights as KHR
          // punctual lights (notably the MacBook's screen-glow point light).
          // The runtime supplies all its own lighting (the baked lightmap +
          // LampSpotKey/MoonAmbient + the live overlays), so these baked lights
          // are an unwanted SECOND light source — the MacBook's, stuck at its
          // export intensity (0.16), threw a bright cool pool onto the desk in
          // front of the machine in BOTH themes (the "light from the computer"
          // speck). Drop every baked light.
          if ((o as { isLight?: boolean }).isLight) {
            o.visible = false;
            return;
          }
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            const std = m as THREE.MeshStandardMaterial;
            if (!std || !("isMeshStandardMaterial" in std)) continue;
            const unit = (std.name || "").replace(/_mat$/, "");
            const emissiveLit =
              !!std.emissiveMap ||
              (std.emissive && std.emissive.r + std.emissive.g + std.emissive.b > 0.25);
            if (!emissiveLit && unit)
              attachBakedLightmap(std, unit, activeState, ctx);
            std.envMapIntensity = 0.35;
          }
        });
        setRoot(gltf.scene);
        parsedRef.current = true;
      },
      undefined,
      (err) => console.error("[baked-scene] load error", err)
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // A mid-load lamp flip needs the other theme's maps NOW — the set we deferred
  // just became the visible one. Prioritize it (idempotent).
  useEffect(() => {
    if (parsedRef.current) runDeferred();
  }, [theme, runDeferred]);

  // Reveal signal: hold the poster until the GLB has parsed, the lightmaps of
  // the theme CURRENTLY on screen have decoded, the shaders have compiled, and
  // a few frames have drawn — then report ready and warm the off-theme set on
  // idle. The gate keys are derived from themeRef at check time (not a
  // parse-time snapshot) so a mid-load lamp flip makes the reveal wait for the
  // set the visitor will actually see, not the one that was active at parse.
  // A wall-clock timeout (anchored at parse) keeps one stuck lightmap from
  // holding the reveal hostage; the GLB itself must still parse, so a total
  // load failure keeps the poster up.
  useFrame(() => {
    if (firedRef.current || !parsedRef.current) return;
    const timedOut =
      performance.now() - startedAtRef.current > BAKED_READY_TIMEOUT_MS;
    if (!timedOut) {
      const visibleState = themeRef.current === "dark" ? "off" : "on";
      for (const unit of ctxRef.current.units) {
        if (!lightmapLoaded(`${unit}-${visibleState}`)) return;
      }
    }
    if (!compileStartedRef.current) {
      compileStartedRef.current = true;
      const done = () => {
        compiledRef.current = true;
      };
      try {
        gl.compileAsync(scene, camera).then(done, done);
      } catch {
        done();
      }
    }
    framesRef.current += 1;
    if ((compiledRef.current || timedOut) && framesRef.current >= 3) {
      firedRef.current = true;
      onReady?.();
      const ric = (
        window as unknown as {
          requestIdleCallback?: (
            cb: () => void,
            opts?: { timeout: number }
          ) => void;
        }
      ).requestIdleCallback;
      if (ric) ric(runDeferred, { timeout: 1500 });
      else window.setTimeout(runDeferred, 600);
    }
  });

  // Resolve a clicked/hovered baked mesh to its object tag by walking UP to the
  // nearest tagged ancestor. A baked object (e.g. the film camera) is many
  // sub-meshes at varying depths after flatten() — a 2-level lookup found the
  // shallow ones (the camera body, so the CLICK worked) but missed the deeper
  // ones (the lens group), so hovering them resolved to "" and the pointer
  // cursor never appeared.
  const objectOf = (e: ThreeEvent<MouseEvent>): string => {
    let o: THREE.Object3D | null = e.object;
    while (o) {
      const tag = o.userData?.object as string | undefined;
      if (tag) return tag;
      o = o.parent;
    }
    return "";
  };

  if (!root) return null;
  return (
    <primitive
      object={root}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        const obj = objectOf(e);
        if (obj === "lamp") {
          e.stopPropagation();
          toggleTheme();
          return;
        }
        const href = NAV_MAP[obj];
        if (href) {
          e.stopPropagation();
          router.push(href);
          return;
        }
        const focusId = FOCUS_MAP[obj];
        if (focusId) {
          e.stopPropagation();
          onFocus(focusId);
        }
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        const obj = objectOf(e as unknown as ThreeEvent<MouseEvent>);
        if (obj === "lamp" || FOCUS_MAP[obj] || NAV_MAP[obj]) {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    />
  );
}

// Drives the shared lightmap mix + the lamp glow from the theme, every frame.
function ThemeDrivers() {
  const { mixRef } = useDeskTheme();
  useFrame(() => {
    const mix = mixRef.current;
    uMix.value = mix;
    // keep the volumetric beam + motes in sympathy with the lamp
    lampGlowRef.current = mix;
    // the moon shaft is the inverse — full at night, gone in lamplight
    moonGlowRef.current = 1 - mix;
  });
  return null;
}

// The lamp's specular key: the baked lightmap only holds soft diffuse, so the
// glossy vinyl / lacquer lost their glint. A cheap SHADOWLESS spot from the
// lamp head re-lights those highlights (the "shine on the record player").
// Off in dark. Placed inside the lamp group so it inherits the lamp pose.
function LampSpotKey() {
  const { mixRef } = useDeskTheme();
  const ref = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(...LAMP_TARGET_LOCAL);
    return o;
  }, []);
  useFrame(() => {
    // Just a specular glint on the glossy vinyl/desk — the diffuse lamp POOL is
    // already in the baked lightmap, so a strong spot double-lit it into blown
    // white hotspots. Low intensity (was 3.6) keeps the shine, not the blowout.
    if (ref.current) ref.current.intensity = 0.9 * Math.max(0, lampGlowRef.current);
  });
  return (
    <group position={PLACEMENT.lamp.position} rotation-y={PLACEMENT.lamp.rotationY}>
      <primitive object={target} />
      <spotLight
        ref={ref}
        position={LAMP_HEAD_LOCAL}
        target={target}
        color="#ffd9a8"
        angle={0.62}
        penumbra={0.9}
        decay={2}
        distance={3.5}
        intensity={0}
      />
    </group>
  );
}

// Cool omnidirectional fill for the dark theme. The baked OFF lightmap already
// carries the moon's DIRECTIONAL shading (baked from the kiln's Moon light), so
// a runtime directional was a redundant second key — and its sharp specular on
// the glossy desk was the hard white hotspot Jason flagged. We drop it: the
// lightmap does direction, this soft blue hemisphere does fill, and MoonBeam
// does the visible shaft.
function MoonAmbient() {
  const ref = useRef<THREE.HemisphereLight>(null);
  useFrame(() => {
    // 0.12 (was 1.05 -> 0.6 -> 0.42 -> 0.26): less cool flood so dark mode reads
    // as night, not a lit room. Jason wanted the night "quite a lot" darker, so
    // the fill comes down again — the room stays just-readable as moonlit, and
    // the motes (driven separately in MoonBeam) stay.
    if (ref.current) ref.current.intensity = 0.12 * Math.max(0, 1 - uMix.value);
  });
  return <hemisphereLight ref={ref} args={["#8298cc", "#0a0b12", 0]} />;
}

function SceneEnvironment() {
  const { gl, scene } = useThree();
  const { mixRef } = useDeskTheme();
  const background = useMemo(() => new THREE.Color(), []);
  // Cool, near-black night vs. warm walnut. The warm env fill is cut hard in
  // dark so it doesn't wash the moonlight into ambient.
  const darkBg = useMemo(() => new THREE.Color("#080a10"), []);
  const lightBg = useMemo(() => new THREE.Color("#1a130c"), []);

  useFrame(() => {
    const mix = mixRef.current;
    scene.environmentIntensity = THREE.MathUtils.lerp(0.05, 0.45, mix);
    scene.background = background.copy(darkBg).lerp(lightBg, mix);
    gl.toneMappingExposure = THREE.MathUtils.lerp(1.08, 1.25, mix);
  });

  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={3} position={[-2.2, 1.7, 1.4]} scale={[3, 2, 1]} target={[0, 0, 0]} color="#ffe7c4" />
      <Lightformer form="rect" intensity={1.1} position={[2.6, 1.2, -0.6]} scale={[2, 1.5, 1]} target={[0, 0, 0]} color="#cfe0f4" />
      <Lightformer form="ring" intensity={1.4} position={[0, 3, 0.4]} scale={3} target={[0, 0, 0]} color="#fff4e6" />
      <Lightformer form="rect" intensity={0.6} position={[0, 0.6, 3.2]} scale={[4, 1.4, 1]} color="#f5ead8" />
    </Environment>
  );
}

type CameraRig = {
  start: THREE.Vector3;
  rest: THREE.Vector3;
  target: THREE.Vector3;
  maxDistance: number;
  fov: number;
};
function useCameraRig(): CameraRig {
  const { size } = useThree();
  return useMemo(() => {
    const aspect = size.width / size.height;
    if (aspect >= 0.9) {
      return {
        start: CAMERA_START,
        rest: CAMERA_REST,
        target: CAMERA_TARGET,
        maxDistance: 1.95,
        fov: CAMERA.fov
      };
    }
    return {
      start: PORTRAIT_START,
      rest: PORTRAIT_REST,
      target: PORTRAIT_TARGET,
      maxDistance: 2.2,
      fov: PORTRAIT_FOV
    };
  }, [size.width, size.height]);
}

type CameraFlight = {
  from: THREE.Vector3;
  fromTarget: THREE.Vector3;
  to: THREE.Vector3;
  toTarget: THREE.Vector3;
  progress: number;
  duration: number;
  unlockOnLand: boolean;
};

function CameraDirector({
  controlsRef,
  rig,
  focus
}: {
  controlsRef: React.RefObject<OrbitControlsImpl>;
  rig: CameraRig;
  focus: FocusId | null;
}) {
  const { camera } = useThree();
  const flightRef = useRef<CameraFlight | null>(null);
  const currentTarget = useRef(rig.target.clone());
  const firstFlightRef = useRef(true);
  const prevFocusRef = useRef<FocusId | null>(null);

  useEffect(() => {
    // Keep the projection fov in sync with the rig (landscape vs the wider
    // portrait framing) on aspect flips.
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera && cam.fov !== rig.fov) {
      cam.fov = rig.fov;
      cam.updateProjectionMatrix();
    }

    const view = focus ? FOCUS_VIEWS[focus] : null;
    const to = view ? new THREE.Vector3(...view.position) : rig.rest.clone();
    const toTarget = view ? new THREE.Vector3(...view.target) : rig.target.clone();
    const isFirst = firstFlightRef.current;
    const focusChanged = focus !== prevFocusRef.current;
    firstFlightRef.current = false;
    prevFocusRef.current = focus;

    // A rig change that did NOT change the focus is a viewport event — the
    // cold-load size correction (300x150 -> real, which flips landscape<->
    // portrait via the resize-nudge) or an orientation flip. Retarget the live
    // dolly instead of restarting it from scratch, so the intro flight isn't
    // aborted ~120 ms in. (If we're already at rest, ease gently to the new
    // framing.)
    if (!isFirst && !focusChanged) {
      if (flightRef.current) {
        flightRef.current.to = to;
        flightRef.current.toTarget = toTarget;
        flightRef.current.unlockOnLand = !focus;
      } else {
        if (controlsRef.current) controlsRef.current.enabled = false;
        flightRef.current = {
          from: camera.position.clone(),
          fromTarget: currentTarget.current.clone(),
          to,
          toTarget,
          progress: 0,
          duration: 0.8,
          unlockOnLand: !focus
        };
      }
      return;
    }

    if (controlsRef.current) controlsRef.current.enabled = false;
    flightRef.current = {
      from: isFirst ? rig.start.clone() : camera.position.clone(),
      fromTarget: currentTarget.current.clone(),
      to,
      toTarget,
      progress: 0,
      duration: isFirst ? 2.3 : 1.05,
      unlockOnLand: !focus
    };
  }, [rig, focus, camera, controlsRef]);

  useFrame((_state, delta) => {
    const flight = flightRef.current;
    if (flight) {
      flight.progress = Math.min(1, flight.progress + delta / flight.duration);
      const eased = 1 - Math.pow(1 - flight.progress, 3);
      camera.position.lerpVectors(flight.from, flight.to, eased);
      currentTarget.current.lerpVectors(flight.fromTarget, flight.toTarget, eased);
      camera.lookAt(currentTarget.current);
      if (flight.progress >= 1) {
        const unlock = flight.unlockOnLand;
        flightRef.current = null;
        if (unlock && controlsRef.current) {
          controlsRef.current.target.copy(currentTarget.current);
          controlsRef.current.enabled = true;
          controlsRef.current.update();
        }
      }
      return;
    }
    if (controlsRef.current?.enabled) {
      currentTarget.current.copy(controlsRef.current.target);
    }
  });

  return null;
}

function BakedPost() {
  return useMemo(
    () => (
      <EffectComposer multisampling={0}>
        <SMAA />
        <Bloom mipmapBlur intensity={0.5} luminanceThreshold={1} levels={7} />
        <Noise opacity={0.03} />
        <Vignette eskil={false} offset={0.26} darkness={0.52} />
      </EffectComposer>
    ),
    []
  );
}

function SceneContents({
  turntablePlaying,
  armDown,
  onNeedleClick,
  focus,
  onFocus,
  labelArtUrl,
  chessFen,
  chessLastMove,
  notes,
  onReady
}: DeskSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null!);
  const rig = useCameraRig();
  return (
    <>
      <ThemeDrivers />
      <SceneEnvironment />
      <CameraDirector controlsRef={controlsRef} rig={rig} focus={focus} />
      <BakedStatics onFocus={onFocus} onReady={onReady} />
      {/* The live, animated MacBook overlays the (hidden) baked one. Its baked
          contact shadow stays on the desk lightmap and grounds it, so the
          transform MUST be exactly PLACEMENT.macbook — no offset. */}
      <group
        position={PLACEMENT.macbook.position}
        rotation-y={PLACEMENT.macbook.rotationY}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onFocus("work");
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <MacBook open={focus === "work"} />
      </group>
      {/* The live chessboard overlays the (hidden) baked one and shows the real
          world-vs-Jason game from props — the baked board was frozen at the
          bake's rest position. Same transform as the bake so its painted
          contact shadow still grounds it. */}
      <group
        position={PLACEMENT.chessboard.position}
        rotation-y={PLACEMENT.chessboard.rotationY}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onFocus("chess");
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <Chessboard fen={chessFen} lastMove={chessLastMove} />
      </group>
      {/* The live turntable overlays the (hidden) baked one so the platter
          spins on play and the tonearm drops on the needle click. Like
          DeskScene, the wrapping group has NO onClick — the only interaction
          is the needle (onNeedleClick → records view), handled inside the
          component. Same transform as the bake so its contact shadow grounds
          it. */}
      <group
        position={PLACEMENT.turntable.position}
        rotation-y={PLACEMENT.turntable.rotationY}
      >
        <Turntable
          playing={turntablePlaying}
          armDown={armDown}
          onNeedleClick={onNeedleClick}
          labelArtUrl={labelArtUrl}
        />
      </group>
      {/* The live notepad overlays the (hidden) baked one and writes the real
          guestbook notes from props — the baked sheet was frozen with the old
          placeholder. Same transform as the bake so its painted contact shadow
          still grounds it. */}
      <group
        position={PLACEMENT.notepad.position}
        rotation-y={PLACEMENT.notepad.rotationY}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onFocus("notes");
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <Notepad notes={notes} />
      </group>
      <LampSpotKey />
      <MoonAmbient />
      {/* The visible moonlight shaft: streams in through the window opening and
          lands in a pool on the desk. Start sits just inside the glass so the
          bright head isn't stuck on the mullions. */}
      <MoonBeam
        start={[0.08, 1.12, -0.7]}
        end={[0.25, 0.02, 0.05]}
        topRadius={0.2}
        poolRadius={0.3}
      />
      <group position={PLACEMENT.lamp.position} rotation-y={PLACEMENT.lamp.rotationY}>
        <LampBeam />
      </group>
      <OrbitControls
        ref={controlsRef}
        enabled={false}
        target={rig.target.toArray()}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        minDistance={1.0}
        maxDistance={rig.maxDistance}
        minPolarAngle={0.55}
        maxPolarAngle={1.32}
        minAzimuthAngle={-0.5}
        maxAzimuthAngle={0.5}
      />
      <BakedPost />
    </>
  );
}

export default function BakedDeskScene(props: DeskSceneProps) {
  const { theme, toggleTheme } = useSiteTheme();

  // Cold-load insurance: the hero canvas mounts while the load curtain still
  // holds its container at 0 height, so R3F's ResizeObserver can latch the
  // default 300x150 and never re-measure (scene never mounts → black). Nudge a
  // couple of resize events after mount so it picks up the real size.
  useEffect(() => {
    const fire = () => window.dispatchEvent(new Event("resize"));
    const timers = [120, 500, 1200].map((ms) => setTimeout(fire, ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: CAMERA.fov, near: 0.1, far: 20, position: CAMERA.start }}
      // R3F sets touch-action:none on its container div by default (to stop 3D
      // gestures from scrolling the page). We need pan-y so the user can scroll
      // past the hero on mobile — orbit is disabled anyway on this scene.
      style={{ touchAction: "pan-y" }}
      gl={{
        antialias: false,
        powerPreference: "high-performance",
        // cheap for a single hero canvas; lets us grab the baked frame for
        // captures + a future no-WebGL poster / OG image
        preserveDrawingBuffer: true,
        toneMapping: THREE.ACESFilmicToneMapping
      }}
    >
      <DeskThemeProvider theme={theme} toggleTheme={toggleTheme}>
        <Suspense fallback={null}>
          <SceneContents {...props} />
        </Suspense>
      </DeskThemeProvider>
    </Canvas>
  );
}
