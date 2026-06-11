import * as THREE from "three";

export const PALETTE = {
  woodDesk: "#6f4d31",
  woodDeskStreak: "#5a3d26",
  woodFloor: "#4a3a28",
  woodFloorStreak: "#3b2d1e",
  wallCream: "#e6d8c0",
  paperCream: "#f5efe2",
  accentCoral: "#c75833",
  claudeOrange: "#d97757",
  inkDark: "#26231d",
  chrome: "#f2f2f0",
  spotifyGreen: "#1db954"
} as const;

type CanvasDraw = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) => void;

type CanvasTextureOptions = {
  repeat?: [number, number];
  srgb?: boolean;
  anisotropy?: number;
};

export function makeCanvasTexture(
  width: number,
  height: number,
  draw: CanvasDraw,
  options: CanvasTextureOptions = {}
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context unavailable for texture generation.");
  }

  draw(ctx, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  if (options.srgb !== false) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  if (options.repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(options.repeat[0], options.repeat[1]);
  }
  texture.anisotropy = options.anisotropy ?? 4;
  return texture;
}

export function woodGrainTexture(
  base: string = PALETTE.woodDesk,
  streak: string = PALETTE.woodDeskStreak,
  width = 1024,
  height = 512
): THREE.CanvasTexture {
  return makeCanvasTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 150; i++) {
      const y = Math.random() * h;
      const length = w * (0.3 + Math.random() * 0.7);
      const x = Math.random() * (w - length);
      ctx.strokeStyle = streak;
      ctx.globalAlpha = 0.04 + Math.random() * 0.1;
      ctx.lineWidth = 0.6 + Math.random() * 2.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const segments = 6;
      for (let s = 1; s <= segments; s++) {
        ctx.lineTo(
          x + (length * s) / segments,
          y + Math.sin(s * 1.7 + i) * 1.8
        );
      }
      ctx.stroke();
    }

    for (let k = 0; k < 4; k++) {
      const cx = Math.random() * w;
      const cy = Math.random() * h;
      for (let ring = 1; ring <= 4; ring++) {
        ctx.strokeStyle = streak;
        ctx.globalAlpha = 0.1 - ring * 0.018;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, ring * 4.5, ring * 2.6, 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  });
}

export function woodMaterial(
  options: { base?: string; streak?: string; roughness?: number } = {}
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: woodGrainTexture(options.base, options.streak),
    roughness: options.roughness ?? 0.55,
    metalness: 0.02
  });
}

export function chromeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.chrome,
    metalness: 1,
    roughness: 0.12
  });
}

export function brushedMetalMaterial(
  color = "#b9b6ae"
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.9,
    roughness: 0.38
  });
}

export function plasticMaterial(
  color: string,
  roughness = 0.45
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

export function paperMaterial(
  color: string = PALETTE.paperCream
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
}

export function feltMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
}
