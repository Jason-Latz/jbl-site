"use client";

import { BOOKS, type Book } from "@/content/books";

// Tolerates content/books.ts gaining an optional review field mid-flight.
function bookReview(book: Book): string | null {
  return (book as Book & { review?: string | null }).review ?? null;
}

function BookCard({ book }: { book: Book }) {
  const review = bookReview(book);
  return (
    <li className="desk-panel-note">
      <div className="desk-panel-row">
        <span
          aria-hidden="true"
          style={{
            width: 10,
            height: 44,
            borderRadius: 3,
            flex: "none",
            background: book.spineColor
          }}
        />
        <div className="desk-panel-row-main">
          <p className="desk-panel-row-title">{book.title}</p>
          <p className="desk-panel-meta">{book.author}</p>
        </div>
      </div>
      {review ? (
        <p className="desk-panel-note-body" style={{ marginTop: 8 }}>
          {review}
        </p>
      ) : (
        <p className="desk-panel-empty" style={{ marginTop: 8 }}>
          Jason&rsquo;s review is on its way.
        </p>
      )}
    </li>
  );
}

function Shelf({ title, books }: { title: string; books: Book[] }) {
  return (
    <section className="desk-panel-section">
      <h3 className="desk-panel-section-title">{title}</h3>
      {books.length > 0 ? (
        <ul className="desk-panel-list">
          {books.map((book) => (
            <BookCard key={`${book.title}-${book.author}`} book={book} />
          ))}
        </ul>
      ) : (
        <p className="desk-panel-empty">Nothing on this shelf yet.</p>
      )}
    </section>
  );
}

export default function ReadingPanel() {
  const real = BOOKS.filter((book) => !book.filler);
  const favorites = real.filter((book) => book.shelf === "favorites");
  const current = real.filter((book) => book.shelf === "current");

  return (
    <>
      <Shelf title="Favorites" books={favorites} />
      <Shelf title="Currently reading" books={current} />
      <p className="desk-panel-meta">The shelf grows &mdash; check back.</p>
    </>
  );
}
