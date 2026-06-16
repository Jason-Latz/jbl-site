import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// Next 14 data-caches supabase-js GET fetches inside route handlers even under
// `dynamic = "force-dynamic"`, freezing reads within a warm instance (see
// CLAUDE.md). Override `global.fetch` so the cookie-bound editor client always
// hits the database — auth checks and post/photo reads must be fresh.
export function createFreshRouteHandlerClient() {
  return createRouteHandlerClient(
    { cookies },
    {
      options: {
        global: {
          fetch: (input, init) => fetch(input, { ...init, cache: "no-store" })
        }
      }
    }
  );
}
