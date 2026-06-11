import * as THREE from "three";

// Loads an external image (album art) as a texture through the same-origin
// /api/image-proxy route so WebGL never taints. Returns a cancel function;
// the texture is disposed if cancelled before arrival.
export function loadProxiedTexture(
  url: string,
  onLoad: (texture: THREE.Texture) => void
): () => void {
  let cancelled = false;
  new THREE.TextureLoader().load(
    `/api/image-proxy?u=${encodeURIComponent(url)}`,
    (texture) => {
      if (cancelled) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      onLoad(texture);
    },
    undefined,
    () => {
      // Failed loads leave the procedural placeholder in place.
    }
  );
  return () => {
    cancelled = true;
  };
}
