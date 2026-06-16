"use client";

// Baked-scene VIEWER (dev only). Loads the world-space uv1 GLB and KEEPS its
// real MeshStandard materials (metalness/roughness intact) so chrome and gloss
// still reflect — then adds the baked lightmap on uv1 for cheap diffuse GI and
// an Environment for specular/reflections. This is the "baked + beauty" look:
// unlike the earlier unlit-MeshBasic pass, the lamp chrome and the record
// player shine again. ON/OFF lightmaps crossfade by a shared uMix.

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

const HERO_POS: [number, number, number] = [0.18, 0.82, 1.62];
const HERO_TGT: [number, number, number] = [0.05, 0.42, -0.55];

const uMix = { value: 1 };
const uOffBoost = { value: 2.2 };

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

// Attach the two-state lightmap blend to an EXISTING MeshStandard material
// (keeps map/metalness/roughness/emissive). The lightmap drives diffuse GI;
// the env map handles specular + metal reflections.
function attachBakedLightmap(mat: THREE.MeshStandardMaterial, unit: string) {
  mat.lightMap = lightmap(unit, "on");
  mat.lightMapIntensity = Math.PI; // cancels three's RECIPROCAL_PI on the lightmap
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

function MixDriver({ state }: { state: "on" | "off" }) {
  useFrame((_, delta) => {
    const target = state === "on" ? 1 : 0;
    uMix.value = THREE.MathUtils.damp(uMix.value, target, 3.4, delta);
  });
  return null;
}

function Baked({ envIntensity }: { envIntensity: number }) {
  const [root, setRoot] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      "/_bake/desk-window-uv1.glb",
      (gltf) => {
        if (cancelled) return;
        let lit = 0;
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            const std = m as THREE.MeshStandardMaterial;
            if (!std || !("isMeshStandardMaterial" in std)) continue;
            const unit = (std.name || "").replace(/_mat$/, "");
            // emissive-dominant materials (night window, screen) keep glowing
            // and skip the lightmap; everything else gets baked diffuse.
            const emissiveLit =
              !!std.emissiveMap ||
              (std.emissive && std.emissive.r + std.emissive.g + std.emissive.b > 0.25);
            if (!emissiveLit && unit) {
              attachBakedLightmap(std, unit);
              lit++;
            }
            std.envMapIntensity = envIntensity;
          }
        });
        if (typeof window !== "undefined") (window as any).__bk = { scene: gltf.scene, lit };
        setRoot(gltf.scene);
      },
      undefined,
      (err) => console.error("[baked] load error", err)
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return root ? <primitive object={root} /> : null;
}

function SceneEnv() {
  // No-network env: warm key from the left, cool rim right, soft ceiling, front
  // fill — same shape as the live scene's SceneEnvironment, for chrome/specular.
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={3} position={[-2.2, 1.7, 1.4]} scale={[3, 2, 1]} target={[0, 0, 0]} color="#ffe7c4" />
      <Lightformer form="rect" intensity={1.1} position={[2.6, 1.2, -0.6]} scale={[2, 1.5, 1]} target={[0, 0, 0]} color="#cfe0f4" />
      <Lightformer form="ring" intensity={1.4} position={[0, 3, 0.4]} scale={3} target={[0, 0, 0]} color="#fff4e6" />
      <Lightformer form="rect" intensity={0.6} position={[0, 0.6, 3.2]} scale={[4, 1.4, 1]} color="#f5ead8" />
    </Environment>
  );
}

export default function BakedViewer() {
  const [state, setState] = useState<"on" | "off">("on");
  const [exposure, setExposure] = useState(1.15);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "b") setState((s) => (s === "on" ? "off" : "on"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (glRef.current) glRef.current.toneMappingExposure = exposure;
  }, [exposure]);

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", background: "#0a0a0c", zIndex: 50 }}>
      <div style={{ position: "absolute", zIndex: 10, top: 12, left: 12, display: "flex", gap: 8, alignItems: "center", fontFamily: "monospace", color: "#eee", fontSize: 13 }}>
        <button onClick={() => setState("on")} style={{ padding: "4px 10px", background: state === "on" ? "#c75833" : "#333", color: "#fff", border: 0, borderRadius: 4 }}>lamp ON</button>
        <button onClick={() => setState("off")} style={{ padding: "4px 10px", background: state === "off" ? "#3a5a8a" : "#333", color: "#fff", border: 0, borderRadius: 4 }}>lamp OFF</button>
        <span>exposure</span>
        <input type="range" min={0.4} max={2.5} step={0.05} value={exposure} onChange={(e) => setExposure(parseFloat(e.target.value))} />
        <span>{exposure.toFixed(2)}</span>
      </div>
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 40, near: 0.05, far: 30, position: HERO_POS }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          glRef.current = gl;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = exposure;
        }}
      >
        <color attach="background" args={["#0a0a0c"]} />
        <SceneEnv />
        <Baked envIntensity={0.35} />
        <MixDriver state={state} />
        <OrbitControls target={HERO_TGT} />
      </Canvas>
    </div>
  );
}
