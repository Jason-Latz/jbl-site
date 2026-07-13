/**
 * The publish date is the FIRST moment a post was published, and never changes after.
 *
 * - First publish (no stored date yet) stamps `now`.
 * - Re-saving or autosaving an already-published post keeps the original date.
 * - Unpublishing preserves the original date, so re-publishing later keeps the
 *   first-publish date rather than resetting it.
 *
 * Passing `existing = null` covers the create path (a brand-new post).
 */
export function resolvePublishedAt(
  nextPublished: boolean,
  existingPublishedAt: string | null,
  now: string
): string | null {
  if (existingPublishedAt) {
    return existingPublishedAt;
  }

  return nextPublished ? now : null;
}
