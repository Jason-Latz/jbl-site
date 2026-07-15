import type { Metadata } from "next";
import SummerBlog from "./SummerBlog";

export const dynamic = "force-dynamic";

// Unlisted: kept out of search and not linked from the nav. Reachable only by
// anyone who has the URL.
export const metadata: Metadata = {
  title: "Summer Blog",
  robots: { index: false, follow: false }
};

const TERMS = [
  "Every week, by Sunday night, each of us (Jason, David, and Adrian) publishes a public piece of writing.",
  "Any form counts: essay, story, poem, letter, review, argument, journal entry. Real writing, not a tweet.",
  "Written by a human. No AI.",
  "It has to be public, something you can hand someone a link to.",
  "Drop your link in your slot below before the Sunday-night deadline."
];

export default function SummerBlogPage() {
  return (
    <section className="section summer-blog">
      <header className="page-header">
        <p className="eyebrow">Summer Blog</p>
        <h1>A Weekly Pact</h1>
        <p className="standfirst">
          A standing pact between Jason, David, and Adrian: one public piece of
          writing each, every week.
        </p>
      </header>

      <div className="card summer-blog-terms">
        <h2>Terms of the Contract</h2>
        <ol>
          {TERMS.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ol>
      </div>

      <SummerBlog />
    </section>
  );
}
