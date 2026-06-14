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

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { GLTFLoader } from "three-stdlib";
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
import { lampGlowRef } from "./objects/DeskLamp";
import MoonBeam, { moonGlowRef } from "./objects/MoonBeam";
import type { DeskSceneProps } from "./DeskScene";

const GLB_URL = "/_bake/desk-window-uv1.glb";

// Which baked object maps to which focus view. Lamp is special (theme toggle).
const FOCUS_MAP: Record<string, FocusId> = {
  turntable: "records",
  macbook: "work",
  bookRow: "reading",
  chessboard: "chess",
  notepad: "notes"
};

const CAMERA_START = new THREE.Vector3(...CAMERA.start);
const CAMERA_REST = new THREE.Vector3(...CAMERA.rest);
const CAMERA_TARGET = new THREE.Vector3(...CAMERA.target);
const PORTRAIT_START = new THREE.Vector3(0.3, 1.8, 2.4);
const PORTRAIT_REST = new THREE.Vector3(-0.1, 1.15, 1.0);
const PORTRAIT_TARGET = new THREE.Vector3(-0.14, 0.02, -0.02);

// ——— two-state lightmap blend, driven by the real theme mix ———
const uMix = { value: 1 };
// Keeps the baked moonlight visible without washing it flat; the cool moon
// directional below supplies the "from the window" direction + speculars.
const uOffBoost = { value: 2.0 };

// Lamp local axis (matches BakeScene's LAMP_HEAD/TARGET_LOCAL).
const LAMP_HEAD_LOCAL: [number, number, number] = [0.3446, 0.4195, 0.0088];
const LAMP_TARGET_LOCAL: [number, number, number] = [0.5, 0, 0.12];

const texLoader = new THREE.TextureLoader();
const lmCache = new Map<string, THREE.Texture>();
function lightmap(unit: string, state: "on" | "off"): THREE.Texture {
  const key = `${unit}-${state}`;
  let t = lmCache.get(key);
  if (!t) {
    t = texLoader.load(`/_bake/lightmaps/${key}.png`);
    t.flipY = false;
    t.channel = 1;
    t.colorSpace = THREE.LinearSRGBColorSpace;
    lmCache.set(key, t);
  }
  return t;
}

function attachBakedLightmap(mat: THREE.MeshStandardMaterial, unit: string) {
  mat.lightMap = lightmap(unit, "on");
  mat.lightMapIntensity = Math.PI;
  const lmOff = lightmap(unit, "off");
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lightMapOff = { value: lmOff };
    shader.uniforms.uMix = uMix;
    shader.uniforms.uOffBoost = uOffBoost;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        /void main\(\)\s*\{/,
        "uniform sampler2D lightMapOff;\nuniform float uMix;\nuniform float uOffBoost;\nvoid main() {"
      )
      .replace(
        "vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );",
        "vec4 lightMapTexel = mix( texture2D( lightMapOff, vLightMapUv ) * uOffBoost, texture2D( lightMap, vLightMapUv ), uMix );"
      );
  };
  mat.needsUpdate = true;
}

function BakedStatics({
  onFocus,
  onReady
}: {
  onFocus: (id: FocusId) => void;
  onReady?: () => void;
}) {
  const { toggleTheme } = useDeskTheme();
  const [root, setRoot] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;
    new GLTFLoader().load(
      GLB_URL,
      (gltf) => {
        if (cancelled) return;
        gltf.scene.traverse((o) => {
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
            if (!emissiveLit && unit) attachBakedLightmap(std, unit);
            std.envMapIntensity = 0.35;
          }
        });
        setRoot(gltf.scene);
        onReady?.();
      },
      undefined,
      (err) => console.error("[baked-scene] load error", err)
    );
    return () => {
      cancelled = true;
    };
  }, [onReady]);

  const objectOf = (e: ThreeEvent<MouseEvent>): string =>
    (e.object.userData?.object as string) ||
    (e.object.parent?.userData?.object as string) ||
    "";

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
        const focusId = FOCUS_MAP[obj];
        if (focusId) {
          e.stopPropagation();
          onFocus(focusId);
        }
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        const obj = objectOf(e as unknown as ThreeEvent<MouseEvent>);
        if (obj === "lamp" || FOCUS_MAP[obj]) {
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
    if (ref.current) ref.current.intensity = 3.6 * Math.max(0, lampGlowRef.current);
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
    if (ref.current) ref.current.intensity = 1.05 * Math.max(0, 1 - uMix.value);
  });
  return <hemisphereLight ref={ref} args={["#8298cc", "#0a0b12", 0]} />;
}

// The MacBook screen glow in dark mode. The baked laptop is closed, so its
// screen can't spill light — this stands in for it: a cool point glow + a small
// emissive panel just in front of the lid, pooling cool light on the desk the
// way the ajar screen did on the live scene. Dark-only.
function LaptopGlow() {
  const lightRef = useRef<THREE.PointLight>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const dark = Math.max(0, 1 - uMix.value);
    if (lightRef.current) lightRef.current.intensity = 0.55 * dark;
    if (matRef.current) matRef.current.opacity = 0.38 * dark;
  });
  // macbook sits at PLACEMENT.macbook ([0.02, 0, -0.08]); the spill is just in
  // front of its lid, low over the desk.
  return (
    <group position={[0.02, 0, 0.04]}>
      <pointLight
        ref={lightRef}
        position={[0, 0.045, 0.02]}
        color="#bcd2ff"
        intensity={0}
        distance={0.55}
        decay={2}
      />
      <mesh position={[0, 0.004, 0.0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[0.16, 0.13]} />
        <meshBasicMaterial
          ref={matRef}
          color="#bcd2ff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
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

type CameraRig = { start: THREE.Vector3; rest: THREE.Vector3; target: THREE.Vector3; maxDistance: number };
function useCameraRig(): CameraRig {
  const { size } = useThree();
  return useMemo(() => {
    const aspect = size.width / size.height;
    if (aspect >= 0.9) {
      return { start: CAMERA_START, rest: CAMERA_REST, target: CAMERA_TARGET, maxDistance: 1.95 };
    }
    return { start: PORTRAIT_START, rest: PORTRAIT_REST, target: PORTRAIT_TARGET, maxDistance: 2.5 };
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

  useEffect(() => {
    const view = focus ? FOCUS_VIEWS[focus] : null;
    const isFirst = firstFlightRef.current;
    firstFlightRef.current = false;
    if (controlsRef.current) controlsRef.current.enabled = false;
    flightRef.current = {
      from: isFirst ? rig.start.clone() : camera.position.clone(),
      fromTarget: currentTarget.current.clone(),
      to: view ? new THREE.Vector3(...view.position) : rig.rest.clone(),
      toTarget: view ? new THREE.Vector3(...view.target) : rig.target.clone(),
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

function SceneContents({ focus, onFocus, onReady }: DeskSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null!);
  const rig = useCameraRig();
  return (
    <>
      <ThemeDrivers />
      <SceneEnvironment />
      <CameraDirector controlsRef={controlsRef} rig={rig} focus={focus} />
      <BakedStatics onFocus={onFocus} onReady={onReady} />
      <LampSpotKey />
      <MoonAmbient />
      <LaptopGlow />
      {/* The visible moonlight shaft: streams in through the window opening and
          lands in a pool on the desk. Start sits just inside the glass so the
          bright head isn't stuck on the mullions. */}
      <MoonBeam
        start={[0.08, 1.12, -0.7]}
        end={[0.25, 0.02, 0.05]}
        topRadius={0.22}
        poolRadius={0.34}
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
