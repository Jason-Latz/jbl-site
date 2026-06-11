"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AccumulativeShadows,
  Environment,
  Lightformer,
  OrbitControls,
  RandomizedLight,
  SoftShadows
} from "@react-three/drei";
import {
  Bloom,
  EffectComposer,
  SMAA,
  Vignette
} from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { DeskThemeProvider, useDeskTheme } from "./DeskThemeContext";
import { useSiteTheme } from "./useSiteTheme";
import { CAMERA, PLACEMENT } from "./layout";
import Desk from "./Desk";
import Room from "./Room";
import Bookshelf from "./objects/Bookshelf";
import Chessboard from "./objects/Chessboard";
import DeskLamp from "./objects/DeskLamp";
import MacBook from "./objects/MacBook";
import Notepad from "./objects/Notepad";
import RecordCrate from "./objects/RecordCrate";
import Turntable from "./objects/Turntable";

export type DeskSceneProps = {
  turntablePlaying: boolean;
  armDown: boolean;
  onNeedleClick: () => void;
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

// The precomputation Jason asked for, made literal: 120 randomized light
// samples accumulate once into a soft baked contact-shadow layer on the desk
// top. After the bake it costs one textured plane.
function BakedDeskShadows() {
  return (
    <group scale={[1, 1, 0.52]}>
      <AccumulativeShadows
        temporal={false}
        frames={120}
        alphaTest={0.78}
        opacity={0.7}
        color="#3a2414"
        scale={2.05}
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

// One-time dolly from the establishing shot to the resting framing.
// Orbit controls unlock when it lands.
function CameraIntro({
  controlsRef,
  rig
}: {
  controlsRef: React.RefObject<OrbitControlsImpl>;
  rig: CameraRig;
}) {
  const { camera } = useThree();
  const progressRef = useRef(0);
  const doneRef = useRef(false);
  const fromRef = useRef<THREE.Vector3 | null>(null);

  // Aspect flips (e.g. rotating a phone) swap the rig after the intro has
  // landed — ease from wherever the camera is to the new resting framing.
  useEffect(() => {
    if (doneRef.current) {
      fromRef.current = camera.position.clone();
      progressRef.current = 0;
      doneRef.current = false;
      if (controlsRef.current) {
        controlsRef.current.enabled = false;
      }
    }
  }, [rig, camera, controlsRef]);

  useFrame((_, delta) => {
    if (doneRef.current) {
      return;
    }
    progressRef.current = Math.min(1, progressRef.current + delta / 2.3);
    const eased = 1 - Math.pow(1 - progressRef.current, 3);
    camera.position.lerpVectors(fromRef.current ?? rig.start, rig.rest, eased);
    camera.lookAt(rig.target);
    if (progressRef.current >= 1) {
      doneRef.current = true;
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }
    }
  });

  return null;
}

function Placed({
  name,
  children
}: {
  name: keyof typeof PLACEMENT;
  children: React.ReactNode;
}) {
  const placement = PLACEMENT[name];
  return (
    <group position={placement.position} rotation-y={placement.rotationY}>
      {children}
    </group>
  );
}

function SceneContents({
  turntablePlaying,
  armDown,
  onNeedleClick
}: DeskSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null!);
  const rig = useCameraRig();

  return (
    <>
      <SoftShadows size={18} samples={16} focus={0.42} />
      <SceneEnvironment />
      <LightingRig />
      <CameraIntro controlsRef={controlsRef} rig={rig} />
      <Room />
      <Desk />
      <BakedDeskShadows />
      <Placed name="turntable">
        <Turntable
          playing={turntablePlaying}
          armDown={armDown}
          onNeedleClick={onNeedleClick}
        />
      </Placed>
      <Placed name="lamp">
        <DeskLamp />
      </Placed>
      <Placed name="macbook">
        <MacBook />
      </Placed>
      <Placed name="bookshelf">
        <Bookshelf />
      </Placed>
      <Placed name="chessboard">
        <Chessboard />
      </Placed>
      <Placed name="notepad">
        <Notepad />
      </Placed>
      <Placed name="crate">
        <RecordCrate />
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
        maxPolarAngle={1.05}
        minAzimuthAngle={-0.5}
        maxAzimuthAngle={0.5}
      />
      <EffectComposer multisampling={0}>
        <SMAA />
        <Bloom mipmapBlur intensity={0.5} luminanceThreshold={1} levels={7} />
        <Vignette eskil={false} offset={0.26} darkness={0.52} />
      </EffectComposer>
    </>
  );
}

export default function DeskScene(props: DeskSceneProps) {
  const { theme, toggleTheme } = useSiteTheme();

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
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
