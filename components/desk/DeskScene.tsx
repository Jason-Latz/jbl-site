"use client";

import { Suspense, memo, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AccumulativeShadows,
  Environment,
  Lightformer,
  OrbitControls,
  RandomizedLight,
  SoftShadows
} from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { markShadowsDirty, shadowsDirtyNow } from "@/lib/three/shadow-dirty";
import { DeskThemeProvider, useDeskTheme } from "./DeskThemeContext";
import { useSiteTheme } from "./useSiteTheme";
import { CAMERA, FOCUS_VIEWS, PLACEMENT, type FocusId } from "./layout";
import DeskBase from "./Desk";
import DeskEffects from "./Effects";
import RoomBase from "./concepts/RoomWindow";
import ChessboardBase from "./objects/Chessboard";
import DeskBookRowBase from "./objects/DeskBookRow";
import TennisRacketBase from "./objects/TennisRacket";
import DeskLampBase from "./objects/DeskLamp";
import FilmCameraBase from "./objects/FilmCamera";
import LampBeamBase from "./objects/LampBeam";
import MacBookBase from "./objects/MacBook";
import NotepadBase from "./objects/Notepad";
import PhotoStackBase from "./objects/PhotoStack";
import RecordCrateBase from "./objects/RecordCrate";
import TurntableBase from "./objects/Turntable";

// Every DeskHero state change (needle phase, polls, focus) re-renders this
// tree; without memo each procedural object re-reconciles its hundreds of
// R3F elements at exactly the wrong moment (the focus click). All props
// passed below are primitives or identity-stable (DeskHero guarantees it),
// so memo holds and a click re-renders only what actually changed.
const Desk = memo(DeskBase);
const Room = memo(RoomBase);
const Chessboard = memo(ChessboardBase);
const DeskBookRow = memo(DeskBookRowBase);
const TennisRacket = memo(TennisRacketBase);
const DeskLamp = memo(DeskLampBase);
const FilmCamera = memo(FilmCameraBase);
const PhotoStack = memo(PhotoStackBase);
const LampBeam = memo(LampBeamBase);
const MacBook = memo(MacBookBase);
const Notepad = memo(NotepadBase);
const RecordCrate = memo(RecordCrateBase);
const Turntable = memo(TurntableBase);

export type DeskSceneProps = {
  turntablePlaying: boolean;
  armDown: boolean;
  onNeedleClick: () => void;
  focus: FocusId | null;
  onFocus: (id: FocusId) => void;
  labelArtUrl: string | null;
  coverArtUrls: string[];
  // Live world-vs-Jason game state for the 3D board (null until loaded;
  // the board falls back to the start position).
  chessFen: string | null;
  chessLastMove: { from: string; to: string } | null;
  // Fires once a few frames in — i.e. after the synchronous shadow bake —
  // so the hero can fade the canvas in instead of showing the freeze.
  onReady?: () => void;
};

const CAMERA_START = new THREE.Vector3(...CAMERA.start);
const CAMERA_REST = new THREE.Vector3(...CAMERA.rest);
const CAMERA_TARGET = new THREE.Vector3(...CAMERA.target);

// Portrait viewports can't fit the whole desk without shrinking it to a
// miniature, so they frame the turntable cluster instead and let visitors
// orbit to the rest. Full mobile tuning is a Stage 4 item.
const PORTRAIT_START = new THREE.Vector3(0.3, 1.8, 2.4);
const PORTRAIT_REST = new THREE.Vector3(-0.1, 1.15, 1.0);
const PORTRAIT_TARGET = new THREE.Vector3(-0.14, 0.02, -0.02);

type CameraRig = {
  start: THREE.Vector3;
  rest: THREE.Vector3;
  target: THREE.Vector3;
  maxDistance: number;
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
        maxDistance: 1.95
      };
    }
    return {
      start: PORTRAIT_START,
      rest: PORTRAIT_REST,
      target: PORTRAIT_TARGET,
      maxDistance: 2.5
    };
  }, [size.width, size.height]);
}

// Custom image-based lighting built from hand-placed Lightformers (rendered
// once into a PMREM env map — no network fetch): a warm window key from the
// left, a cool rim from the right, a soft ceiling ring, and a front fill so
// chrome shows a believable room. Background, env intensity, and filmic
// exposure all crossfade with the lamp/theme mix.
function SceneEnvironment() {
  const { gl, scene } = useThree();
  const { mixRef } = useDeskTheme();
  const background = useMemo(() => new THREE.Color(), []);
  const darkBg = useMemo(() => new THREE.Color("#0e0a07"), []);
  const lightBg = useMemo(() => new THREE.Color("#efe4cf"), []);

  useFrame(() => {
    const mix = mixRef.current;
    scene.environmentIntensity = THREE.MathUtils.lerp(0.1, 0.8, mix);
    scene.background = background.copy(darkBg).lerp(lightBg, mix);
    gl.toneMappingExposure = THREE.MathUtils.lerp(0.72, 1.12, mix);
  });

  return (
    <Environment resolution={512} frames={1}>
      <Lightformer
        form="rect"
        intensity={3}
        position={[-2.2, 1.7, 1.4]}
        scale={[3, 2, 1]}
        target={[0, 0, 0]}
        color="#ffe7c4"
      />
      <Lightformer
        form="rect"
        intensity={1.1}
        position={[2.6, 1.2, -0.6]}
        scale={[2, 1.5, 1]}
        target={[0, 0, 0]}
        color="#cfe0f4"
      />
      <Lightformer
        form="ring"
        intensity={1.4}
        position={[0, 3, 0.4]}
        scale={3}
        target={[0, 0, 0]}
        color="#fff4e6"
      />
      <Lightformer
        form="rect"
        intensity={0.6}
        position={[0, 0.6, 3.2]}
        scale={[4, 1.4, 1]}
        color="#f5ead8"
      />
    </Environment>
  );
}

// The precomputation Jason asked for, made literal: 220 randomized light
// samples accumulate once into a soft baked contact-shadow layer on the desk
// top (2k map — he approved spending seconds of load on this). After the
// bake it costs one textured plane.
function BakedDeskShadows() {
  // Clipped exactly to the desk top (1.9 x 0.85): the old oversized catcher
  // overhung the slab edges and its faint shading read as a translucent
  // border floating around the desk.
  return (
    <group scale={[1, 1, 0.85 / 1.9]}>
      <AccumulativeShadows
        temporal={false}
        frames={220}
        resolution={2048}
        alphaTest={0.78}
        opacity={0.7}
        color="#3a2414"
        scale={1.9}
        position={[0, 0.0008, 0]}
      >
        <RandomizedLight
          amount={8}
          radius={0.55}
          intensity={1.05}
          ambient={0.45}
          position={[-0.5, 1.4, 0.7]}
          bias={0.001}
        />
      </AccumulativeShadows>
    </group>
  );
}

// Ambient fill that follows the theme. The lamp's own spotlight lives in the
// DeskLamp object; this rig is the room's general light.
function LightingRig() {
  const { mixRef } = useDeskTheme();
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);

  useFrame(() => {
    const mix = mixRef.current;
    if (hemiRef.current) {
      hemiRef.current.intensity = THREE.MathUtils.lerp(0.05, 0.55, mix);
    }
    if (keyRef.current) {
      keyRef.current.intensity = THREE.MathUtils.lerp(0.03, 0.65, mix);
    }
  });

  return (
    <>
      <hemisphereLight
        ref={hemiRef}
        args={["#fff2e0", "#3a2c1e", 0.55]}
      />
      <directionalLight
        ref={keyRef}
        position={[1.5, 1.7, 1.3]}
        color="#fff0dd"
        intensity={0.65}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={6}
        shadow-camera-left={-1.6}
        shadow-camera-right={1.6}
        shadow-camera-top={1.6}
        shadow-camera-bottom={-1.6}
        shadow-bias={-0.0004}
      />
    </>
  );
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

// Every camera move is a hand-framed flight between fixed views: the intro
// dolly, focus close-ups (click an object), the return to rest, and aspect
// flips. Orbit controls only unlock at the resting view.
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
    if (controlsRef.current) {
      controlsRef.current.enabled = false;
    }
    flightRef.current = {
      from: isFirst ? rig.start.clone() : camera.position.clone(),
      fromTarget: currentTarget.current.clone(),
      to: view ? new THREE.Vector3(...view.position) : rig.rest.clone(),
      toTarget: view ? new THREE.Vector3(...view.target) : rig.target.clone(),
      progress: 0,
      // 1.05 s focus flights (was 1.25): with the panel's backdrop blur
      // gone, the shorter dolly reads snappy instead of rushed.
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

// The desk is a still life: freeze both shadow maps after the warm-up and
// re-render them only while a mover (chess glide, MacBook lid, tonearm)
// holds the dirty flag. Steady-state this removes ~450 casters x 2 lights
// of shadow draws per frame — the audit's single biggest runtime win.
function FrozenShadows() {
  const { gl } = useThree();
  useEffect(() => {
    // Render freely through the bake + first reveal, then freeze.
    markShadowsDirty(2.0);
    gl.shadowMap.autoUpdate = false;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame(() => {
    if (shadowsDirtyNow()) {
      gl.shadowMap.needsUpdate = true;
    }
  });
  return null;
}

// Reports "the scene is actually drawing" — and spends the load curtain on
// upfront work: renderer.compileAsync walks the whole graph and compiles
// every shader program before the fade-in reveals the first frame, so no
// interaction later pays a first-compile hitch.
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const { gl, scene, camera } = useThree();
  const framesRef = useRef(0);
  const compileStartedRef = useRef(false);
  const compiledRef = useRef(false);
  const firedRef = useRef(false);
  useFrame(() => {
    framesRef.current += 1;
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
    if (!firedRef.current && framesRef.current >= 3 && compiledRef.current) {
      firedRef.current = true;
      onReady?.();
    }
  });
  return null;
}

function Placed({
  name,
  focusId,
  onFocus,
  children
}: {
  name: keyof typeof PLACEMENT;
  focusId?: FocusId;
  onFocus?: (id: FocusId) => void;
  children: React.ReactNode;
}) {
  const placement = PLACEMENT[name];
  const clickable = Boolean(focusId && onFocus);
  return (
    <group
      position={placement.position}
      rotation-y={placement.rotationY}
      onClick={
        clickable
          ? (event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              onFocus!(focusId!);
            }
          : undefined
      }
      onPointerOver={
        clickable
          ? (event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              document.body.style.cursor = "pointer";
            }
          : undefined
      }
      onPointerOut={
        clickable
          ? () => {
              document.body.style.cursor = "auto";
            }
          : undefined
      }
    >
      {children}
    </group>
  );
}

function SceneContents({
  turntablePlaying,
  armDown,
  onNeedleClick,
  focus,
  onFocus,
  labelArtUrl,
  coverArtUrls,
  chessFen,
  chessLastMove,
  onReady
}: DeskSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null!);
  const rig = useCameraRig();

  return (
    <>
      <ReadySignal onReady={onReady} />
      <FrozenShadows />
      {/* samples 10 (was 16): PCSS runs per-fragment scene-wide; below 10
          the penumbra dithers, above it the eye stops noticing. */}
      <SoftShadows size={18} samples={10} focus={0.42} />
      <SceneEnvironment />
      <LightingRig />
      <CameraDirector controlsRef={controlsRef} rig={rig} focus={focus} />
      <Room />
      <Desk />
      <BakedDeskShadows />
      <Placed name="turntable">
        <Turntable
          playing={turntablePlaying}
          armDown={armDown}
          onNeedleClick={onNeedleClick}
          labelArtUrl={labelArtUrl}
        />
      </Placed>
      <Placed name="lamp">
        {/* DeskLamp before LampBeam: the lamp writes lampGlowRef in its
            useFrame and the beam reads it the same frame (mount order). */}
        <DeskLamp />
        <LampBeam />
      </Placed>
      <Placed name="macbook" focusId="work" onFocus={onFocus}>
        <MacBook open={focus === "work"} />
      </Placed>
      <Placed name="bookRow" focusId="reading" onFocus={onFocus}>
        <DeskBookRow />
      </Placed>
      <Placed name="racket">
        <TennisRacket />
      </Placed>
      <Placed name="chessboard" focusId="chess" onFocus={onFocus}>
        <Chessboard fen={chessFen} lastMove={chessLastMove} />
      </Placed>
      <Placed name="notepad" focusId="notes" onFocus={onFocus}>
        <Notepad />
      </Placed>
      <Placed name="crate">
        <RecordCrate coverArtUrls={coverArtUrls} />
      </Placed>
      {/* Travel/photography vignette — décor for now; focus views and a
          panel arrive once /photography splits from /travel. */}
      <Placed name="photos">
        <PhotoStack />
      </Placed>
      <Placed name="filmCamera">
        <FilmCamera />
      </Placed>
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
        // opened from 1.05 for the v3 middle-tilt rest pose, which sits
        // lower (polar ~1.17) to keep the window in frame
        maxPolarAngle={1.32}
        minAzimuthAngle={-0.5}
        maxAzimuthAngle={0.5}
      />
      <DeskEffects />
    </>
  );
}

export default function DeskScene(props: DeskSceneProps) {
  const { theme, toggleTheme } = useSiteTheme();

  return (
    <Canvas
      shadows
      // Fixed DPR, no adaptive regression: the old AdaptiveDpr +
      // performance.regress() pairing dropped resolution to ~55% during
      // camera flights and popped back at rest — a visible snap Jason
      // read as jank. A constant 1.5 cap costs ~27% fewer pixels than
      // the old 1.75 ceiling and never changes mid-motion.
      dpr={[1, 1.5]}
      camera={{
        fov: CAMERA.fov,
        near: 0.1,
        far: 20,
        position: CAMERA.start
      }}
      gl={{
        antialias: false,
        powerPreference: "high-performance",
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
