"use client";

// The export stage of the bake pipeline (dev-only, mounted by /bake).
//
// Mounts the REAL desk objects — same components, same procedural geometry
// and canvas textures as the live homepage — minus everything that must not
// reach Blender: the volumetric beam and motes (additive shader fakes), the
// reflector film (drei shader material), accumulative shadows, post effects,
// HUD. After the scene settles (theme mix + lamp warm-up reach steady state
// so emissive materials export with the right energy), it serializes the
// whole thing to a binary GLB and POSTs it to /api/bake/upload.
//
// Marker empties (MARKER_*) ride along in the GLB so the Blender script can
// recover the camera pose and the lamp's optical axis without re-deriving
// any of layout.ts.

import { useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { DeskThemeProvider } from "./DeskThemeContext";
import { CAMERA, PLACEMENT } from "./layout";
import Desk from "./Desk";
import Turntable from "./objects/Turntable";
import DeskLamp from "./objects/DeskLamp";
import MacBook from "./objects/MacBook";
import FloorBookcase from "./objects/FloorBookcase";
import Speaker from "./objects/Speaker";
import Chessboard from "./objects/Chessboard";
import Notepad from "./objects/Notepad";
import RecordCrate from "./objects/RecordCrate";
import FilmCamera from "./objects/FilmCamera";
import PhotoStack from "./objects/PhotoStack";
import RoomVoid from "./concepts/RoomVoid";
import RoomWindow from "./concepts/RoomWindow";

export type BakeRoom = "void" | "window";
export type BakeTheme = "light" | "dark";

// Lamp-local marker coordinates: the beam's optical axis (head pivot and the
// point on the desk it aims at), kept in sync with LampBeam's constants.
const LAMP_HEAD_LOCAL: [number, number, number] = [0.3446, 0.4195, 0.0088];
const LAMP_TARGET_LOCAL: [number, number, number] = [0.5, 0, 0.12];

// How long to let useFrames settle before exporting. The lamp warm-up
// envelope completes in ~1.2s; 3.5s leaves margin for slow first frames.
const SETTLE_MS = 3500;

function At({
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

function Markers() {
  return (
    <>
      <object3D name="MARKER_camPos" position={CAMERA.rest} />
      <object3D name="MARKER_camStart" position={CAMERA.start} />
      <object3D name="MARKER_camTarget" position={CAMERA.target} />
      <group
        position={PLACEMENT.lamp.position}
        rotation-y={PLACEMENT.lamp.rotationY}
      >
        <object3D name="MARKER_lampHead" position={LAMP_HEAD_LOCAL} />
        <object3D name="MARKER_lampTarget" position={LAMP_TARGET_LOCAL} />
      </group>
    </>
  );
}

// Anything carrying a drei MeshReflectorMaterial must not export: the
// exporter would serialize it as a screenshot-gray standard material sitting
// 0.5mm above the real desk wood. Detect it structurally (the material's
// class name survives in dev, and `mixBlur` is unique to it).
function isReflectorMaterial(material: THREE.Material): boolean {
  return (
    /Reflector/i.test(material.constructor.name) ||
    "mixBlur" in (material as unknown as Record<string, unknown>)
  );
}

function Exporter({
  room,
  theme,
  onStatus
}: {
  room: BakeRoom;
  theme: BakeTheme;
  onStatus: (status: string) => void;
}) {
  const { scene } = useThree();
  const fired = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (fired.current) return;
      fired.current = true;

      const hidden: THREE.Object3D[] = [];
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        if (materials.some((m) => m && isReflectorMaterial(m))) {
          mesh.visible = false;
          hidden.push(mesh);
        }
      });

      onStatus("exporting…");
      new GLTFExporter().parse(
        scene,
        async (result) => {
          hidden.forEach((o) => (o.visible = true));
          const name = `desk-${room}-${theme}.glb`;
          const response = await fetch(`/api/bake/upload?name=${name}`, {
            method: "POST",
            body: result as ArrayBuffer
          });
          const payload = await response.json();
          onStatus(
            response.ok
              ? `saved ${name} (${(payload.bytes / 1e6).toFixed(1)} MB)`
              : `upload failed: ${payload.error}`
          );
        },
        (error) => {
          hidden.forEach((o) => (o.visible = true));
          onStatus(`export failed: ${String(error)}`);
        },
        { binary: true, onlyVisible: true }
      );
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [scene, room, theme, onStatus]);

  return null;
}

export default function BakeScene({
  room,
  theme
}: {
  room: BakeRoom;
  theme: BakeTheme;
}) {
  const [status, setStatus] = useState("settling…");

  return (
    <div style={{ width: "100%", height: "80vh", background: "#111" }}>
      <div
        style={{
          color: "#f6f2e9",
          fontFamily: "monospace",
          padding: "0.5rem 1rem"
        }}
        data-bake-status={status}
      >
        bake export — room: {room}, theme: {theme} — {status}
      </div>
      <Canvas
        shadows={false}
        dpr={1}
        camera={{ fov: CAMERA.fov, near: 0.1, far: 20, position: CAMERA.rest }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <DeskThemeProvider theme={theme} toggleTheme={() => {}}>
          <ambientLight intensity={0.8} />
          <Markers />
          {room === "void" ? <RoomVoid /> : <RoomWindow />}
          <Desk />
          <At name="turntable">
            <Turntable playing={false} armDown={false} onNeedleClick={() => {}} />
          </At>
          <At name="lamp">
            <DeskLamp />
          </At>
          <At name="macbook">
            <MacBook open={false} />
          </At>
          <At name="floorBookcase">
            <FloorBookcase />
          </At>
          <At name="speakerLeft">
            <Speaker />
          </At>
          <At name="speakerRight">
            <Speaker />
          </At>
          <At name="chessboard">
            <Chessboard />
          </At>
          <At name="notepad">
            <Notepad />
          </At>
          <At name="crate">
            <RecordCrate />
          </At>
          <At name="photos">
            <PhotoStack />
          </At>
          <At name="filmCamera">
            <FilmCamera />
          </At>
          <Exporter room={room} theme={theme} onStatus={setStatus} />
        </DeskThemeProvider>
      </Canvas>
    </div>
  );
}
