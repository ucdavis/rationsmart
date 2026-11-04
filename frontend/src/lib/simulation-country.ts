"use client";

import { useMemo } from "react";
import { useStore, type User } from "@/lib/store";
import type { CattleInfo } from "@/lib/api-client/models";

/**
 * The user as Feed Selection must see them: their own id, but the SIMULATION
 * country picked on Cattle Info, not the profile's (N5). Since F3 Continue no
 * longer copies that country onto `user`, so every feed list, search, custom
 * feed and feed edit reads the country from here. A form persisted by an
 * older build has no country, so it falls back to the profile's.
 */
export function simulationUser(
  user: User | null,
  cattleInfo: Pick<CattleInfo, "country" | "country_id"> | null | undefined
): User | null {
  if (!user || !cattleInfo?.country_id || cattleInfo.country_id === user.country_id) return user;
  return {
    ...user,
    country_id: cattleInfo.country_id,
    country: cattleInfo.country || user.country,
  };
}

/** `simulationUser` from the store, stable while user and country don't change. */
export function useSimulationUser(): User | null {
  const user = useStore((s) => s.user);
  const countryId = useStore((s) => s.cattleInfo?.country_id);
  const country = useStore((s) => s.cattleInfo?.country);
  return useMemo(
    () =>
      simulationUser(user, countryId ? { country_id: countryId, country: country ?? "" } : null),
    [user, countryId, country]
  );
}
