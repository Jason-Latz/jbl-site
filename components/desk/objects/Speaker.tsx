"use client";

// Small wooden bookshelf speaker, grille off — one of a stereo pair
// flanking the desk so the turntable has something to play through.
// Classic hi-fi proportions: a walnut-veneer cabinet with softly radiused
// vertical edges, a near-black baffle sunk a few millimeters behind a
// walnut reveal frame, and the drivers left exposed — a 75mm paper-cone
// woofer under a chrome-trimmed 25mm silk-dome tweeter, four black
// mounting screws around each. The bass port is on the rear (centered, so
// the component stays perfectly left/right symmetric — mount it with
// positive or negative yaw and it reads correctly either way).
//
// Conventions: meters, base at exactly y=0, centered on its own origin,
// front faces +z. Export-safe: only Standard/Physical materials, no
// transmission. Static fastener/frame families merge into single draws —
// the whole speaker renders in 11 calls.

import { useMemo } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { mergeBufferGeometries } from "three-stdlib";
import { makeCanvasTexture, chromeMaterial } from "@/lib/three/materials";

// Cabinet envelope: 0.135 W x 0.16 D x 0.21 H overall (0.207 box on 3mm
// rubber feet). The walnut body stops 3mm shy of the front; a separate
// walnut frame (the "lip") carries the last 3mm of depth around a
// 119 x 191 mm opening, so the black baffle inside it reads as recessed.
const CAB_W = 0.135;
const CAB_H = 0.207;
const FOOT_H = 0.003;
const EDGE_R = 0.004; // radiused vertical edges
const LIP_T = 0.003; // lip front lands at +0.08 — total depth 0.16
const BODY_D = 0.157; // body z spans -0.08 .. +0.077
const BODY_FRONT_Z = 0.077;
const REAR_Z = -0.08;

const OPEN_W = 0.119; // lip opening
const OPEN_H = 0.191;
const BAFFLE_W = 0.123; // baffle overlaps the opening 2mm a side,
const BAFFLE_H = 0.195; // so its edges hide behind the lip annulus
const BAFFLE_T = 0.005;
const FZ = 0.0777; // baffle front face — 0.7mm proud of the body wall
// (no coplanar faces), 2.3mm sunk behind the lip
const BAFFLE_CY = FOOT_H + CAB_H / 2;

// Front layout (absolute y): tweeter up top, woofer lower-center, maker's
// badge bottom-center. Rear port at upper-mid height.
const TWEET_Y = 0.165;
const WOOF_Y = 0.085;
const BADGE_Y = 0.022;
const PORT_Y = 0.15;

// Tweeter dome: a sphere cap whose base circle is the 25mm bore. With
// thetaLength 0.8 the parent sphere radius solves to bore/sin(0.8), and
// the cap base sits at sphereR*cos(0.8) above the sphere center.
const DOME_BORE_R = 0.0125;
const DOME_THETA = 0.8;
const DOME_SPHERE_R = DOME_BORE_R / Math.sin(DOME_THETA);
const DOME_BASE_OFFSET = DOME_SPHERE_R * Math.cos(DOME_THETA);

const FOOT_POSITIONS: [number, number][] = [
  [-0.0495, -0.0525],
  [0.0495, -0.0525],
  [-0.0495, 0.0525],
  [0.0495, 0.0525]
];

// Four screws per driver on the 45-degree diagonals — symmetric across x,
// so the mirrored twin matches.
const SCREW_DIAGONALS: [number, number][] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1]
];

function lathe(points: [number, number][], segments: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );
}

// Rounded-rectangle plan, drawn in XY — extruded along +Z and stood up
// for the body (radiused vertical edges), used flat for the lip frame.
function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const hw = w / 2;
  const hh = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hh - r);
  s.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hh);
  s.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hh + r);
  s.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Static same-material details bake into one draw (FilmCamera pattern).
type Part = {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
};

function bakeParts(parts: Part[]): THREE.BufferGeometry {
  const merged = mergeBufferGeometries(
    parts.map((p) => {
      const geometry = p.geometry.index
        ? p.geometry.toNonIndexed()
        : p.geometry.clone();
      if (p.rotation) {
        geometry.applyMatrix4(
          new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...p.rotation))
        );
      }
      geometry.translate(...p.position);
      return geometry;
    })
  );
  if (!merged) {
    throw new Error("Speaker: static detail merge failed.");
  }
  return merged;
}

// Straight-grain walnut veneer — deliberately knot-free (the lib's
// woodGrainTexture throws cathedral rings; veneer this small is rift-cut
// and straight) and a shade darker than the desk so the speakers read as
// their own piece of furniture. Grain runs along canvas Y: extrude UVs are
// world-unit, which lands the grain vertical on the sides and front frame
// and front-to-back across the top — how a real veneer wrap is laid.
function walnutVeneerTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = "#5d3f28";
      ctx.fillRect(0, 0, w, h);

      // Broad tonal bands — adjacent veneer leaves cut from one flitch.
      for (let i = 0; i < 7; i++) {
        const x = Math.random() * w;
        ctx.fillStyle = Math.random() > 0.5 ? "#654630" : "#523722";
        ctx.globalAlpha = 0.1 + Math.random() * 0.12;
        ctx.fillRect(x, 0, w * (0.06 + Math.random() * 0.16), h);
      }

      // Long straight grain lines with a lazy drift.
      for (let i = 0; i < 220; i++) {
        const x = Math.random() * w;
        const light = Math.random() > 0.6;
        ctx.strokeStyle = light ? "#76512f" : "#432d1a";
        ctx.globalAlpha = 0.05 + Math.random() * 0.11;
        ctx.lineWidth = 0.6 + Math.random() * 1.8;
        const drift = (Math.random() - 0.5) * 9;
        const phase = Math.random() * 10;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        for (let s = 1; s <= 10; s++) {
          ctx.lineTo(
            x + (drift * s) / 10 + Math.sin(s * 0.8 + phase) * 1.6,
            (h * s) / 10
          );
        }
        ctx.stroke();
      }

      // Walnut's open pores: short dark dashes along the grain.
      ctx.strokeStyle = "#341f10";
      for (let i = 0; i < 900; i++) {
        ctx.globalAlpha = 0.06 + Math.random() * 0.12;
        ctx.lineWidth = 0.7;
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 1.4, y + 3 + Math.random() * 7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    { repeat: [6, 6], anisotropy: 8 }
  );
}

// Pressed paper cone. Lathe UVs run U around the cone and V down the
// profile, so radial fibers are vertical strokes and pressing rings are
// horizontal bands. Doubles as the bump map.
function paperConeTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = "#ab9a7d";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 340; i++) {
        const x = Math.random() * w;
        ctx.strokeStyle = Math.random() > 0.55 ? "#c0af90" : "#8d7c61";
        ctx.globalAlpha = 0.05 + Math.random() * 0.1;
        ctx.lineWidth = 0.6 + Math.random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (Math.random() - 0.5) * 5, h);
        ctx.stroke();
      }
      for (let y = 10; y < h; y += 13) {
        ctx.strokeStyle = y % 26 < 13 ? "#9b8a6e" : "#b5a486";
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.1;
      for (let i = 0; i < 700; i++) {
        const g = Math.random() > 0.5 ? "#d6c6a6" : "#73644c";
        ctx.fillStyle = g;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.6);
      }
      ctx.globalAlpha = 1;
    },
    { anisotropy: 8 }
  );
}

// Fine matte tooth for the big black baffle so it doesn't read as a void.
function baffleBumpTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i++) {
        const g = 110 + Math.floor(Math.random() * 36);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
    },
    { srgb: false, repeat: [3, 3], anisotropy: 4 }
  );
}

// Maker's plate: brushed brass, serif "LATZ AUDIO" — Jason's, and nothing
// trademarked.
function badgeTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(
    256,
    80,
    (ctx, w, h) => {
      ctx.fillStyle = "#ab9061";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 120; i++) {
        const y = Math.random() * h;
        ctx.strokeStyle = Math.random() > 0.5 ? "#bda474" : "#937a4e";
        ctx.globalAlpha = 0.12 + Math.random() * 0.18;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#6e5836";
      ctx.lineWidth = 4;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = "#241b10";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "600 30px Georgia, 'Times New Roman', serif";
      ctx.fillText("LATZ AUDIO", w / 2, h / 2 + 2);
    },
    { anisotropy: 8 }
  );
}

export default function Speaker() {
  const geo = useMemo(() => {
    // Walnut body: rounded plan (vertical-edge radius) drawn in XY,
    // extruded to height, stood up, then nudged -1.5mm so the body spans
    // z -0.08..+0.077 and leaves room for the lip in the 0.16 envelope.
    const body = new THREE.ExtrudeGeometry(
      roundedRectShape(CAB_W, BODY_D, EDGE_R),
      { depth: CAB_H, bevelEnabled: false, curveSegments: 10 }
    );
    body.rotateX(-Math.PI / 2);
    body.translate(0, FOOT_H, -(LIP_T / 2));

    // Lip frame: a 3mm-thick picture frame proud of the body's front
    // wall. Its rounded inner opening is what makes the baffle read as
    // inset, and the bevel gives the reveal an edge to catch light. The
    // bevel GROWS the outline (and shrinks the hole) by bevelSize, so the
    // shape is cut 2x0.0006 small — the beveled result lands exactly on
    // the body's flat front (the radiused corners stop at +-0.0635) and
    // dead flush with the cabinet's top and base.
    const lipShape = roundedRectShape(
      CAB_W - EDGE_R * 2 - 0.0012,
      CAB_H - 0.0012,
      0.003
    );
    lipShape.holes.push(roundedRectShape(OPEN_W, OPEN_H, 0.002));
    const lip = new THREE.ExtrudeGeometry(lipShape, {
      depth: LIP_T - 0.0012,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0006,
      bevelSegments: 2,
      curveSegments: 8
    });
    lip.translate(0, BAFFLE_CY, BODY_FRONT_Z + 0.0006);

    const cabinet = bakeParts([
      { geometry: body, position: [0, 0, 0] },
      { geometry: lip, position: [0, 0, 0] }
    ]);

    // Woofer cone with its dust cap in one revolved profile: straight
    // paper flare from the surround down into the throat, then the dome
    // bulging back out. The cap apex stays below the baffle plane, the
    // tail pokes harmlessly into the solid cabinet.
    const wooferCone = lathe(
      [
        [0.0376, 0],
        [0.034, -0.0028],
        [0.028, -0.0066],
        [0.021, -0.0098],
        [0.014, -0.0122],
        [0.0118, -0.0128],
        [0.0108, -0.0112],
        [0.0092, -0.0096],
        [0.0068, -0.0083],
        [0.0038, -0.0074],
        [0.0001, -0.0071]
      ],
      96
    );

    // Cast woofer basket flange + machined tweeter faceplate share one
    // dark-metal material, so they bake into a single draw. Both lathes
    // are built facing +y and stood up to +z here.
    const wooferFlange = lathe(
      [
        [0.0432, 0.0002],
        [0.0468, 0.0006],
        [0.0475, 0.0014],
        [0.0469, 0.0024],
        [0.0452, 0.0028],
        [0.0438, 0.0026],
        [0.0432, 0.0016]
      ],
      96
    );
    const tweeterPlate = lathe(
      [
        [0.0152, 0.0006],
        [0.015, 0.0018],
        [0.0158, 0.0024],
        [0.0205, 0.0033],
        [0.0242, 0.0035],
        [0.0256, 0.0029],
        [0.026, 0.0016],
        [0.026, 0.0002]
      ],
      96
    );
    const driverFrames = bakeParts([
      {
        geometry: wooferFlange,
        position: [0, WOOF_Y, FZ],
        rotation: [Math.PI / 2, 0, 0]
      },
      {
        geometry: tweeterPlate,
        position: [0, TWEET_Y, FZ],
        rotation: [Math.PI / 2, 0, 0]
      }
    ]);

    // Rear bass port: flared trim lip, a 25mm bore wall, and a center
    // disc plugging the far end so the tube reads dark, not hollow.
    const port = lathe(
      [
        [0.0002, -0.0215],
        [0.0122, -0.0212],
        [0.0125, -0.02],
        [0.0125, -0.002],
        [0.0131, -0.0008],
        [0.0149, 0.0003],
        [0.0172, 0.001],
        [0.0188, 0.0008],
        [0.0193, 0.0002]
      ],
      80
    );

    // All eight mounting screws in one draw; positions are symmetric
    // across x so the mirrored twin matches.
    const screwHead = new THREE.CylinderGeometry(0.0016, 0.0017, 0.0012, 12);
    const screws = bakeParts(
      ([
        [WOOF_Y, 0.0455, 0.003],
        [TWEET_Y, 0.0218, 0.0035]
      ] as const).flatMap(([cy, radius, proud]) =>
        SCREW_DIAGONALS.map(([sx, sy]): Part => {
          const d = radius * Math.SQRT1_2;
          return {
            geometry: screwHead,
            position: [sx * d, cy + sy * d, FZ + proud + 0.0002],
            rotation: [Math.PI / 2, 0, 0]
          };
        })
      )
    );

    // Four low rubber feet, one draw.
    const footGeo = new THREE.CylinderGeometry(0.005, 0.0055, FOOT_H, 24);
    const feet = bakeParts(
      FOOT_POSITIONS.map(([x, z]): Part => ({
        geometry: footGeo,
        position: [x, FOOT_H / 2, z]
      }))
    );

    return { cabinet, wooferCone, driverFrames, port, screws, feet };
  }, []);

  const mats = useMemo(() => {
    const walnutTex = walnutVeneerTexture();
    // Satin oiled veneer — softer than the turntable's piano lacquer so
    // the two wood pieces don't read as one slab.
    const walnut = new THREE.MeshPhysicalMaterial({
      map: walnutTex,
      roughness: 0.48,
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3
    });
    walnut.bumpMap = walnutTex;
    walnut.bumpScale = 0.0008;

    const baffle = new THREE.MeshStandardMaterial({
      color: "#191613",
      roughness: 0.88,
      metalness: 0
    });
    baffle.bumpMap = baffleBumpTexture();
    baffle.bumpScale = 0.0002;

    // DoubleSide: we look INTO the cone funnel and the port bore, and
    // lathe winding flips with profile direction — double-siding both is
    // cheap and export-safe.
    const paperTex = paperConeTexture();
    const paper = new THREE.MeshStandardMaterial({
      map: paperTex,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide
    });
    paper.bumpMap = paperTex;
    paper.bumpScale = 0.0003;

    const rubber = new THREE.MeshStandardMaterial({
      color: "#15120f",
      roughness: 0.68,
      metalness: 0
    });

    const frames = new THREE.MeshStandardMaterial({
      color: "#2a2420",
      roughness: 0.52,
      metalness: 0.45
    });

    // Silk dome: near-black with a warm textile sheen instead of a
    // specular hot spot.
    const dome = new THREE.MeshPhysicalMaterial({
      color: "#15100b",
      roughness: 0.6,
      metalness: 0,
      sheen: 0.55,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color("#9a8568")
    });

    const screws = new THREE.MeshStandardMaterial({
      color: "#11100d",
      roughness: 0.4,
      metalness: 0.65
    });

    const port = new THREE.MeshStandardMaterial({
      color: "#141210",
      roughness: 0.62,
      metalness: 0,
      side: THREE.DoubleSide
    });

    const badge = new THREE.MeshStandardMaterial({
      map: badgeTexture(),
      roughness: 0.34,
      metalness: 0.78
    });

    const chrome = chromeMaterial();
    chrome.envMapIntensity = 1.15;

    return { walnut, baffle, paper, rubber, frames, dome, screws, port, badge, chrome };
  }, []);

  return (
    <group name="speaker">
      <mesh
        name="speakerCabinet"
        geometry={geo.cabinet}
        castShadow
        receiveShadow
        material={mats.walnut}
      />

      {/* Near-black baffle panel, half-buried in the body's front wall so
          its face floats 0.7mm proud (no z-fighting) and 2.3mm behind the
          walnut reveal. */}
      <RoundedBox
        name="speakerBaffle"
        args={[BAFFLE_W, BAFFLE_H, BAFFLE_T]}
        radius={0.0012}
        smoothness={2}
        position={[0, BAFFLE_CY, FZ - BAFFLE_T / 2]}
        receiveShadow
        material={mats.baffle}
      />

      {/* Woofer: paper cone + dust cap, rubber half-round surround. */}
      <group position={[0, WOOF_Y, FZ]}>
        <mesh
          name="speakerWoofer"
          geometry={geo.wooferCone}
          position={[0, 0, 0.0018]}
          rotation={[Math.PI / 2, 0, 0]}
          receiveShadow
          material={mats.paper}
        />
        <mesh
          name="speakerWooferSurround"
          position={[0, 0, 0.0016]}
          castShadow
          material={mats.rubber}
        >
          <torusGeometry args={[0.0405, 0.0034, 14, 96]} />
        </mesh>
      </group>

      {/* Tweeter: silk dome behind a chrome trim ring in the faceplate
          dish. The cap's base circle is the 25mm bore. */}
      <group position={[0, TWEET_Y, FZ]}>
        <mesh
          name="speakerTweeter"
          position={[0, 0, 0.0014 - DOME_BASE_OFFSET]}
          rotation={[Math.PI / 2, 0, 0]}
          material={mats.dome}
        >
          <sphereGeometry
            args={[DOME_SPHERE_R, 48, 16, 0, Math.PI * 2, 0, DOME_THETA]}
          />
        </mesh>
        <mesh
          name="speakerTweeterTrim"
          position={[0, 0, 0.0026]}
          castShadow
          material={mats.chrome}
        >
          <torusGeometry args={[0.0148, 0.0011, 12, 72]} />
        </mesh>
      </group>

      {/* Woofer flange + tweeter faceplate, one merged dark-metal draw. */}
      <mesh
        name="speakerDriverFrames"
        geometry={geo.driverFrames}
        castShadow
        material={mats.frames}
      />

      <mesh name="speakerScrews" geometry={geo.screws} material={mats.screws} />

      {/* Rear bass port — centered, so mirroring by yaw stays honest. */}
      <mesh
        name="speakerPort"
        geometry={geo.port}
        position={[0, PORT_Y, REAR_Z]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={mats.port}
      />

      {/* Maker's plate, bottom-center of the baffle. */}
      <mesh
        name="speakerBadge"
        position={[0, BADGE_Y, FZ + 0.0003]}
        material={mats.badge}
      >
        <boxGeometry args={[0.024, 0.008, 0.0008]} />
      </mesh>

      <mesh name="speakerFeet" geometry={geo.feet} material={mats.rubber} />
    </group>
  );
}
