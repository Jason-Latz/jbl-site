// Books displayed on the desk bookshelf (components/desk/objects/Bookshelf.tsx).
// Real entries are fact-checked — keep titles/authors exact. To add a book later,
// append it to its shelf group below; the shelf packs left-to-right and leaves
// open space on the right, so new spines slot in with no layout changes.

export type BookShelfName = "favorites" | "current";

export type Book = {
  title: string;
  author: string;
  spineColor: string;
  textColor: string;
  heightM: number;
  thicknessM: number;
  shelf: BookShelfName;
  filler?: boolean;
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
    shelf: "favorites"
  },
  {
    title: "Moonwalking with Einstein",
    author: "Joshua Foer",
    spineColor: "#1d2a44",
    textColor: "#eef1f4",
    heightM: 0.215,
    thicknessM: 0.027,
    shelf: "favorites"
  },
  {
    title: "",
    author: "",
    spineColor: "#6f6449",
    textColor: "#d9cfb8",
    heightM: 0.198,
    thicknessM: 0.03,
    shelf: "favorites",
    filler: true
  },
  {
    title: "",
    author: "",
    spineColor: "#50584a",
    textColor: "#ccd1c2",
    heightM: 0.222,
    thicknessM: 0.034,
    shelf: "favorites",
    filler: true
  },

  // current (bottom shelf)
  {
    title: "The Power Law",
    author: "Sebastian Mallaby",
    spineColor: "#22303c",
    textColor: "#cdd6dd",
    heightM: 0.24,
    thicknessM: 0.041,
    shelf: "current"
  },
  {
    title: "On the Edge",
    author: "Nate Silver",
    spineColor: "#e9e4d8",
    textColor: "#23211c",
    heightM: 0.235,
    thicknessM: 0.044,
    shelf: "current"
  },
  {
    title: "",
    author: "",
    spineColor: "#8a5a3b",
    textColor: "#e3d6c2",
    heightM: 0.19,
    thicknessM: 0.026,
    shelf: "current",
    filler: true
  },
  {
    title: "",
    author: "",
    spineColor: "#7c6a52",
    textColor: "#ddd2bf",
    heightM: 0.212,
    thicknessM: 0.031,
    shelf: "current",
    filler: true
  }
];
