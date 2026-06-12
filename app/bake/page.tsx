import { notFound } from "next/navigation";
import BakeScene, {
  type BakeRoom,
  type BakeTheme
} from "@/components/desk/BakeScene";

// Dev-only export stage for the bake pipeline. Visit
//   /bake?room=void&theme=light   (room: void|window, theme: light|dark)
// and the page mounts the real desk scene, waits for materials to settle,
// and writes bake/desk-<room>-<theme>.glb via /api/bake/upload.

export const dynamic = "force-dynamic";

export default function BakePage({
  searchParams
}: {
  searchParams: { room?: string; theme?: string };
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const room: BakeRoom = searchParams.room === "window" ? "window" : "void";
  const theme: BakeTheme = searchParams.theme === "dark" ? "dark" : "light";

  return <BakeScene room={room} theme={theme} />;
}
