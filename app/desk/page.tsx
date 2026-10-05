import type { Metadata } from "next";
import DeskHero from "@/components/desk/DeskHero";

export const metadata: Metadata = {
  title: "The desk",
  description: "Look around Jason's desk: books, music, an ongoing chess game, and a scratch pad."
};

export default function DeskPage() {
  return <DeskHero />;
}
