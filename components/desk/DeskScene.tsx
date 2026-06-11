"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
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

// Image-based lighting from three's built-in RoomEnvironment (no network
// fetch) so chrome and vinyl have something real to reflect. Intensity and
// background crossfade with the lamp/theme mix.
function EnvironmentDriver() {
  const { gl, scene } = useThree();
  const { mixRef } = useDeskTheme();
  const background = useMemo(() => new THREE.Color(), []);
  const darkBg = useMemo(() => new THREE.Color("#0e0a07"), []);
  const lightBg = useMemo(() => new THREE.Color("#efe4cf"), []);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    return () => {
      scene.environment = null;
      envTexture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useFrame(() => {
    const mix = mixRef.current;
    scene.environmentIntensity = THREE.MathUtils.lerp(0.12, 0.85, mix);
    scene.background = background.copy(darkBg).lerp(lightBg, mix);
  });

  return null;
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
  controlsRef
}: {
  controlsRef: React.RefObject<OrbitControlsImpl>;
}) {
  const { camera } = useThree();
  const progressRef = useRef(0);
  const doneRef = useRef(false);

  useFrame((_, delta) => {
    if (doneRef.current) {
      return;
    }
    progressRef.current = Math.min(1, progressRef.current + delta / 2.3);
    const eased = 1 - Math.pow(1 - progressRef.current, 3);
    camera.position.lerpVectors(CAMERA_START, CAMERA_REST, eased);
    camera.lookAt(CAMERA_TARGET);
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

  return (
    <>
      <EnvironmentDriver />
      <LightingRig />
      <CameraIntro controlsRef={controlsRef} />
      <Room />
      <Desk />
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
        target={CAMERA_TARGET.toArray()}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        minDistance={1.0}
        maxDistance={1.95}
        minPolarAngle={0.95}
        maxPolarAngle={1.38}
        minAzimuthAngle={-0.5}
        maxAzimuthAngle={0.5}
      />
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
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <DeskThemeProvider theme={theme} toggleTheme={toggleTheme}>
        <Suspense fallback={null}>
          <SceneContents {...props} />
        </Suspense>
      </DeskThemeProvider>
    </Canvas>
  );
}
