// Single source of truth for "which track headlines the now-playing slot."
//
// The live currently-playing item (`nowPlaying`) always wins — it's present
// even when paused, so a paused track keeps showing correctly. The durable
// recent-tracks store is different: by construction it NEVER contains the
// currently/just-playing track, and Spotify's recently-played feed lags real
// time (observed tens of minutes behind). So a stored play may only stand in as
// "last played" when it is genuinely recent; otherwise the slot is empty
// ("Nothing playing right now") rather than presenting a stale track as if it
// were current. This is the one place every surface (the desk HUD, the activity
// ribbon, the records panel) resolves the headline, so the rule lives here once
// and the whole "old track shown forever after I stop" class of bug dies here.

export type LeadTrackLike = {
  trackName: string;
  artists: string[];
  albumName: string | null;
  trackUrl: string | null;
  albumImageUrl: string | null;
};

export type RecentLeadTrack = LeadTrackLike & { playedAt?: string | null };

export type LeadTrackSource =
  | {
      nowPlaying: LeadTrackLike | null;
      recentTracks: RecentLeadTrack[];
    }
  | null
  | undefined;

// Spotify's recently-played lags, so only let a stored play headline as "last
// played" if it finished within this window — comfortably below the ~20 min
// staleness that reads as broken. Outside it, the slot honestly shows nothing.
export const LEAD_TRACK_FRESHNESS_MS = 10 * 60 * 1000;

export function isFreshPlayedAt(
  playedAt: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!playedAt) {
    return false;
  }

  const playedAtMs = Date.parse(playedAt);
  if (Number.isNaN(playedAtMs)) {
    return false;
  }

  return nowMs - playedAtMs <= LEAD_TRACK_FRESHNESS_MS;
}

export function selectLeadTrack(
  data: LeadTrackSource,
  nowMs: number = Date.now()
): LeadTrackLike | null {
  if (!data) {
    return null;
  }

  if (data.nowPlaying) {
    return data.nowPlaying;
  }

  const mostRecent = data.recentTracks?.[0];
  if (mostRecent && isFreshPlayedAt(mostRecent.playedAt, nowMs)) {
    return mostRecent;
  }

  return null;
}
