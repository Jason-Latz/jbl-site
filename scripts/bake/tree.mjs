// Full node-tree dump with vert counts, to design per-object bake grouping.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const path = process.argv[2] ?? "bake/desk-window-light.glb";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path);
const root = doc.getRoot();

function vcOf(node) {
  const m = node.getMesh();
  if (!m) return 0;
  return m
    .listPrimitives()
    .reduce((s, p) => s + (p.getAttribute("POSITION")?.getCount() || 0), 0);
}
function subtreeVc(node) {
  let v = vcOf(node);
  for (const c of node.listChildren()) v += subtreeVc(c);
  return v;
}
function walk(node, depth) {
  const name = node.getName() || "·";
  const own = vcOf(node);
  const sub = subtreeVc(node);
  const kids = node.listChildren().length;
  console.log(
    `${"  ".repeat(depth)}${name}  ${own ? `own=${own}v` : ""}${kids ? ` sub=${sub}v(${kids})` : ""}`
  );
  if (depth < 2) node.listChildren().forEach((c) => walk(c, depth + 1));
}
for (const scene of root.listScenes()) {
  scene.listChildren().forEach((c) => walk(c, 0));
}
