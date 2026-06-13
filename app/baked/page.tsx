"use client";

// Baked-scene VIEWER (dev only) — loads the world-space uv1 GLB and replaces
// every material with an unlit MeshBasic that shows live albedo × the baked
// lightmap (sampled on uv1). No scene lights, no shadows: the freeze-dried
// look replaying at 60fps. Toggle lamp state with the buttons or 'b'.
//
// NOTE: we load with a bare GLTFLoader in an effect — drei's useGLTF hangs on
// this big embedded-texture GLB, while the raw loader returns in ~2s.

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

const HERO_POS: [number, number, number] = [0.18, 0.82, 1.62];
const HERO_TGT: [number, number, number] = [0.05, 0.42, -0.55];

const texLoader = new THREE.TextureLoader();
const lmCache = new Map<string, THREE.Texture>();
function lightmap(unit: string, state: "on" | "off"): THREE.Texture {
  const key = `${unit}-${state}`;
  let t = lmCache.get(key);
  if (!t) {
    t = texLoader.load(`/_bake/lightmaps/${key}.png`);
    t.flipY = false; // match glTF uv convention
    t.channel = 1; // sample on uv1 (TEXCOORD_1)
    t.colorSpace = THREE.LinearSRGBColorSpace; // irradiance is linear data
    lmCache.set(key, t);
  }
  return t;
}

function isEmissive(mat: any): boolean {
  if (mat.emissiveMap) return true;
  const e = mat.emissive;
  return !!e && e.r + e.g + e.b > 0.02 && (mat.emissiveIntensity ?? 1) > 0;
}

type Lit = { unit: string; mat: THREE.MeshBasicMaterial };

function Baked({ state, intensity }: { state: "on" | "off"; intensity: number }) {
  const [root, setRoot] = useState<THREE.Object3D | null>(null);
  const litRef = useRef<Lit[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    console.log("[baked] loading GLB…");
    loader.load(
      "/_bake/desk-window-uv1.glb",
      (gltf) => {
      if (cancelled) return;
      console.log("[baked] GLB loaded, converting materials");
      const lit: Lit[] = [];
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as any;
        if (!src) return;
        const unit = (src.name || "").replace(/_mat$/, "");
        const common = {
          transparent: src.transparent,
          opacity: src.opacity ?? 1,
          alphaTest: src.alphaTest ?? 0,
          alphaMap: src.alphaMap ?? null,
          side: src.side ?? THREE.FrontSide,
          depthWrite: src.depthWrite ?? true
        };
        if (isEmissive(src)) {
          mesh.material = new THREE.MeshBasicMaterial({
            map: src.emissiveMap ?? src.map ?? null,
            color: src.emissiveMap ? new THREE.Color(0xffffff) : src.emissive ?? new THREE.Color(0xffffff),
            ...common
          });
          return;
        }
        const mat = new THREE.MeshBasicMaterial({
          map: src.map ?? null,
          color: src.map ? new THREE.Color(0xffffff) : src.color ?? new THREE.Color(0xffffff),
          lightMap: lightmap(unit, state),
          lightMapIntensity: intensity,
          ...common
        });
        mesh.material = mat;
        lit.push({ unit, mat });
      });
      litRef.current = lit;
      setRoot(gltf.scene);
      },
      undefined,
      (err) => console.error("[baked] GLB load error", err)
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    for (const { unit, mat } of litRef.current) {
      mat.lightMap = lightmap(unit, state);
      mat.lightMapIntensity = intensity;
      mat.needsUpdate = true;
    }
  }, [root, state, intensity]);

  return root ? <primitive object={root} /> : null;
}

export default function BakedViewer() {
  const [state, setState] = useState<"on" | "off">("on");
  const [intensity, setIntensity] = useState(2.2);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "b") setState((s) => (s === "on" ? "off" : "on"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", background: "#0a0a0c", zIndex: 50 }}>
      <div style={{ position: "absolute", zIndex: 10, top: 12, left: 12, display: "flex", gap: 8, alignItems: "center", fontFamily: "monospace", color: "#eee", fontSize: 13 }}>
        <button onClick={() => setState("on")} style={{ padding: "4px 10px", background: state === "on" ? "#c75833" : "#333", color: "#fff", border: 0, borderRadius: 4 }}>lamp ON</button>
        <button onClick={() => setState("off")} style={{ padding: "4px 10px", background: state === "off" ? "#3a5a8a" : "#333", color: "#fff", border: 0, borderRadius: 4 }}>lamp OFF</button>
        <span>intensity</span>
        <input type="range" min={0.2} max={4} step={0.05} value={intensity} onChange={(e) => setIntensity(parseFloat(e.target.value))} />
        <span>{intensity.toFixed(2)}</span>
      </div>
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 40, near: 0.05, far: 30, position: HERO_POS }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.35;
        }}
      >
        <color attach="background" args={["#0a0a0c"]} />
        <Baked state={state} intensity={intensity} />
        <OrbitControls target={HERO_TGT} />
      </Canvas>
    </div>
  );
}
