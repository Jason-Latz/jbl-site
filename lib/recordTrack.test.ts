import assert from "node:assert/strict";
import test from "node:test";
import { selectLeadTrack, selectRecordTrack } from "./spotifyLeadTrack.ts";

const current = { trackName: "Live track", artists: ["Artist"], albumName: null, trackUrl: null, albumImageUrl: null };
const played = { ...current, trackName: "Last track", playedAt: "2026-11-23T08:00:00.000Z" };

test("the record player can cue history after the live headline ages out", () => {
  const data = { nowPlaying: null, recentTracks: [played] };
  assert.equal(selectLeadTrack(data, Date.parse("2026-11-23T09:00:00.000Z")), null);
  assert.equal(selectRecordTrack(data), played);
});

test("the record player prioritizes the current Spotify track", () => {
  assert.equal(selectRecordTrack({ nowPlaying: current, recentTracks: [played] }), current);
  assert.equal(selectRecordTrack(null), null);
});
