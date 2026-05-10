// Tiny helper for hitting the production REST API directly from tests.
// Tests use these to set up rounds before exercising the UI.

import { request } from "@playwright/test";

export const API = "https://qvlld3o9p6.execute-api.ap-northeast-2.amazonaws.com";
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "mtvote2026";

export async function apiCtx() {
  return request.newContext({
    baseURL: API,
    extraHTTPHeaders: { "Content-Type": "application/json" },
  });
}

export async function startRound(
  newRoundId: string,
  candidates: { id: string; name: string }[],
  mode: "talent" | "hidden_singer" = "talent"
) {
  const ctx = await apiCtx();
  const res = await ctx.post("/admin/round/reset", {
    headers: { "x-admin-token": ADMIN_TOKEN },
    data: { new_round_id: newRoundId, candidates, mode },
  });
  if (!res.ok()) throw new Error(`startRound failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function setRoundState(state: "open" | "closed") {
  const ctx = await apiCtx();
  const res = await ctx.post("/admin/round/state", {
    headers: { "x-admin-token": ADMIN_TOKEN },
    data: { state },
  });
  if (!res.ok()) throw new Error(`setRoundState failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function startSong(candidateId: string, songLabel: string) {
  const ctx = await apiCtx();
  const res = await ctx.post("/admin/round/song", {
    headers: { "x-admin-token": ADMIN_TOKEN },
    data: { candidate_id: candidateId, song_label: songLabel },
  });
  if (!res.ok()) throw new Error(`startSong failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function fetchCurrentRound(): Promise<{
  round_id: string;
  candidates: { id: string; name: string; score: number }[];
  state: "open" | "closed";
  mode: "talent" | "hidden_singer";
  current_song?: { song_id: string; candidate_id: string; song_label: string; likes: number };
}> {
  const ctx = await apiCtx();
  const res = await ctx.get("/round/current");
  return res.json();
}

/** Wait for a candidate's score to reach `expected` (or higher). Polls every 500ms. */
export async function waitForScore(
  candidateId: string,
  expected: number,
  timeoutMs = 30_000
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    const cur = await fetchCurrentRound();
    const c = cur.candidates.find((x) => x.id === candidateId);
    last = c?.score ?? -1;
    if (last >= expected) return last;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Timed out waiting for ${candidateId} score >= ${expected}, last seen: ${last}`
  );
}

/** Wait for current_song.likes to reach `expected` for a given song_id. */
export async function waitForSongLikes(
  songId: string,
  expected: number,
  timeoutMs = 30_000
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    const cur = await fetchCurrentRound();
    if (cur.current_song?.song_id === songId) {
      last = cur.current_song.likes;
      if (last >= expected) return last;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Timed out waiting for song ${songId} likes >= ${expected}, last seen: ${last}`
  );
}
