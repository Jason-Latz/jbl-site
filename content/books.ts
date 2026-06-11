// Books displayed on the desk bookshelf (components/desk/objects/Bookshelf.tsx).
// Real entries are fact-checked — keep titles/authors exact. To add a book later,
// append it to its shelf group below; the shelf packs left-to-right and leaves
// open space on the right, so new spines slot in with no layout changes.
//
// Optional presentation fields (all safe to omit — the shelf picks defaults):
//   review      — Jason's own note on the book; null until he writes one.
//   pageTint    — tint multiplied over the shared page-edge texture.
//   jacketStyle — spine type treatment (serif/sans, run-down-the-spine vs stacked).
//   foilColor   — foil/ink tone used for the spine lettering.
//   bandColor   — head/tail band color where the pages meet the spine.
//   displayFlat — rendered lying flat on top of the bookcase, front cover up.

export type BookShelfName = "favorites" | "current";

export type JacketStyle =
  | "serif-run"
  | "serif-stacked"
  | "sans-run"
  | "sans-stacked";

export type Book = {
  title: string;
  author: string;
  spineColor: string;
  textColor: string;
  heightM: number;
  thicknessM: number;
  shelf: BookShelfName;
  filler?: boolean;
  review?: string | null;
  pageTint?: string;
  jacketStyle?: JacketStyle;
  foilColor?: string;
  bandColor?: string;
  displayFlat?: boolean;
};

export const BOOKS: Book[] = [
  // favorites (top shelf)
  {
    title: "The Wise Man's Fear",
    author: "Patrick Rothfuss",
    spineColor: "#5e1f1c",
    textColor: "#e8d9b8",
    heightM: 0.235,
    thicknessM: 0.052,
    shelf: "favorites",
    review: null,
    pageTint: "#f1e5c6",
    jacketStyle: "serif-stacked",
    foilColor: "#d8b369",
    bandColor: "#c9a050"
  },
  {
    title: "Moonwalking with Einstein",
    author: "Joshua Foer",
    spineColor: "#1d2a44",
    textColor: "#eef1f4",
    heightM: 0.215,
    thicknessM: 0.027,
    shelf: "favorites",
    review: null,
    pageTint: "#f8f2e2",
    jacketStyle: "sans-run",
    foilColor: "#dde4ea",
    bandColor: "#8da2bd"
  },
  {
    title: "",
    author: "",
    spineColor: "#6f6449",
    textColor: "#d9cfb8",
    heightM: 0.198,
    thicknessM: 0.03,
    shelf: "favorites",
    filler: true,
    review: null,
    pageTint: "#ecdfc0"
  },
  {
    title: "",
    author: "",
    spineColor: "#50584a",
    textColor: "#ccd1c2",
    heightM: 0.222,
    thicknessM: 0.034,
    shelf: "favorites",
    filler: true,
    review: null,
    pageTint: "#f0e6cd"
  },
  {
    title: "",
    author: "",
    spineColor: "#5a4636",
    textColor: "#dccfba",
    heightM: 0.206,
    thicknessM: 0.024,
    shelf: "favorites",
    filler: true,
    review: null,
    pageTint: "#e9dbbd"
  },

  // current (bottom shelf)
  {
    title: "The Power Law",
    author: "Sebastian Mallaby",
    spineColor: "#22303c",
    textColor: "#cdd6dd",
    heightM: 0.24,
    thicknessM: 0.041,
    shelf: "current",
    review: null,
    pageTint: "#f6efdd",
    jacketStyle: "serif-run",
    foilColor: "#d7dde2",
    bandColor: "#b8503a"
  },
  {
    title: "On the Edge",
    author: "Nate Silver",
    spineColor: "#e9e4d8",
    textColor: "#23211c",
    heightM: 0.235,
    thicknessM: 0.044,
    shelf: "current",
    review: null,
    pageTint: "#faf5e8",
    jacketStyle: "sans-run",
    foilColor: "#23211c",
    bandColor: "#c75833",
    displayFlat: true
  },
  {
    title: "",
    author: "",
    spineColor: "#8a5a3b",
    textColor: "#e3d6c2",
    heightM: 0.19,
    thicknessM: 0.026,
    shelf: "current",
    filler: true,
    review: null,
    pageTint: "#eedfbe"
  },
  {
    title: "",
    author: "",
    spineColor: "#7c6a52",
    textColor: "#ddd2bf",
    heightM: 0.212,
    thicknessM: 0.031,
    shelf: "current",
    filler: true,
    review: null,
    pageTint: "#f2e8cf"
  },
  {
    title: "",
    author: "",
    spineColor: "#41505a",
    textColor: "#ccd4d9",
    heightM: 0.203,
    thicknessM: 0.028,
    shelf: "current",
    filler: true,
    review: null,
    pageTint: "#f4ecd8"
  }
];
