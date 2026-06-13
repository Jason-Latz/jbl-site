"use client";

// Baked-scene VIEWER (dev only) — loads the world-space uv1 GLB and replaces
// every material with an unlit MeshBasic showing live albedo x baked lightmap
// on uv1. No scene lights, no shadows: the freeze-dried look at 60fps.
//
// Two-state crossfade (the real Stage-D feature): each material samples BOTH
// the lamp-ON and lamp-OFF lightmaps and mixes them by a shared `uMix` uniform,
// frame-damped toward the current lamp state — exactly how the live site's
// DeskThemeContext.mixRef will drive it. The lamp toggle IS the crossfade.
//
// NOTE: bare GLTFLoader (drei's useGLTF hangs on this big embedded-texture GLB).

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

const HERO_POS: [number, number, number] = [0.18, 0.82, 1.62];
const HERO_TGT: [number, number, number] = [0.05, 0.42, -0.55];

// shared uniform: 1 = lamp on, 0 = lamp off. All baked materials read it.
const uMix = { value: 1 };
// The OFF (night) bake is genuinely dim; the approved dark still stays visible
// because Cycles lifted it with +0.6 exposure. We mirror that by boosting ONLY
// the OFF lightmap (leaves the emissive moon untouched, unlike a global lift).
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

function isEmissive(mat: any): boolean {
  if (mat.emissiveMap) return true;
  const e = mat.emissive;
  return !!e && e.r + e.g + e.b > 0.02 && (mat.emissiveIntensity ?? 1) > 0;
}

// Inject a second lightmap (OFF) + uMix into MeshBasic's lightmap fetch so the
// material crossfades. If the chunk text ever changes and the replace no-ops,
// the material simply renders the ON lightmap — a safe failure mode.
function makeBakedMaterial(
  src: any,
  unit: string,
  intensity: number,
  common: any
): THREE.MeshBasicMaterial {
  const lmOn = lightmap(unit, "on");
  const lmOff = lightmap(unit, "off");
  const mat = new THREE.MeshBasicMaterial({
    map: src.map ?? null,
    color: src.map ? new THREE.Color(0xffffff) : src.color ?? new THREE.Color(0xffffff),
    lightMap: lmOn,
    lightMapIntensity: intensity,
    ...common
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.lightMapOff = { value: lmOff };
    shader.uniforms.uMix = uMix;
    shader.uniforms.uOffBoost = uOffBoost;
    // Declare before void main() (always present) — targeting the uniform-decl
    // line is fragile across three versions. Then blend the two lightmaps
    // (OFF boosted so the night desk stays visible like the dark still).
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
  return mat;
}

type Lit = { mat: THREE.MeshBasicMaterial };

function MixDriver({ state }: { state: "on" | "off" }) {
  useFrame((_, delta) => {
    const target = state === "on" ? 1 : 0;
    uMix.value = THREE.MathUtils.damp(uMix.value, target, 3.4, delta);
  });
  return null;
}

function Baked({ intensity }: { intensity: number }) {
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
          const mat = makeBakedMaterial(src, unit, intensity, common);
          mesh.material = mat;
          lit.push({ mat });
        });
        litRef.current = lit;
        if (typeof window !== "undefined") (window as any).__bk = { scene: gltf.scene, lit: lit.length };
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
    for (const { mat } of litRef.current) {
      mat.lightMapIntensity = intensity;
    }
  }, [root, intensity]);

  return root ? <primitive object={root} /> : null;
}

export default function BakedViewer() {
  const [state, setState] = useState<"on" | "off">("on");
  // ~pi cancels three's RECIPROCAL_PI on the MeshBasic lightmap, giving a truer
  // 1:1 match to the Cycles irradiance we baked.
  const [intensity, setIntensity] = useState(3.1);

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
          gl.toneMappingExposure = 1.55;
        }}
      >
        <color attach="background" args={["#0a0a0c"]} />
        <Baked intensity={intensity} />
        <MixDriver state={state} />
        <OrbitControls target={HERO_TGT} />
      </Canvas>
    </div>
  );
}
