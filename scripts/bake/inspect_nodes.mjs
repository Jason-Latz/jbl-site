// Dump the node graph of a GLB: node names, hierarchy depth, whether they
// bear a mesh, instancing. Tells us if we can select objects by name.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const path = process.argv[2];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path);
const root = doc.getRoot();

let named = 0;
let meshNodes = 0;
let instanced = 0;
const namedSamples = [];

function walk(node, depth) {
  const name = node.getName() || "";
  const mesh = node.getMesh();
  if (mesh) meshNodes++;
  if (name) {
    named++;
    if (namedSamples.length < 80) {
      const vc = mesh
        ? mesh
            .listPrimitives()
            .reduce((s, p) => s + (p.getAttribute("POSITION")?.getCount() || 0), 0)
        : 0;
      namedSamples.push(
        `${"  ".repeat(depth)}${name}${mesh ? ` [mesh ${vc}v]` : " (group)"}`
      );
    }
  }
  const inst = node.getExtension("EXT_mesh_gpu_instancing");
  if (inst) instanced++;
  node.listChildren().forEach((c) => walk(c, depth + 1));
}
for (const scene of root.listScenes()) {
  scene.listChildren().forEach((c) => walk(c, 0));
}

console.log(`total named nodes: ${named}, mesh-bearing nodes: ${meshNodes}, instanced: ${instanced}`);
console.log("--- named nodes (first 80) ---");
console.log(namedSamples.join("\n"));
