import { getToken } from "./auth";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export type RoundState = "open" | "closed";
export type RoundMode = "talent" | "hidden_singer";

export interface Candidate {
  id: string;
  name: string;
  /** Live cumulative score, only present in /round/current responses. */
  score?: number;
}

export interface SongSession {
  song_id: string;
  candidate_id: string | null;
  song_label: string;
  started_at: number;
  likes: number;
}

export interface CurrentRound {
  round_id: string;
  candidates: Candidate[];
  state: RoundState;
  mode: RoundMode;
  /** Only present in hidden_singer mode (null when no song started yet). */
  current_song?: SongSession | null;
  /** History of all songs in this round (hidden_singer only). */
  songs?: SongSession[];
}

function adminHeaders(): HeadersInit {
  const token = getToken();
  return token ? { "x-admin-token": token } : {};
}

export async function fetchCurrentRound(): Promise<CurrentRound> {
  const res = await fetch(`${API_BASE}/round/current`);
  if (!res.ok) throw new Error(`round fetch failed: ${res.status}`);
  return res.json();
}

/** Talent mode: cast a vote for one candidate. */
export async function submitVote(candidateId: string, deviceId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_id: candidateId, device_id: deviceId }),
  });
  if (!res.ok) throw new Error(`vote failed: ${res.status}`);
}

/** Hidden singer mode: tap "like" on the current song. */
export async function submitLike(songId: string, deviceId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ song_id: songId, device_id: deviceId }),
  });
  if (!res.ok) throw new Error(`like failed: ${res.status}`);
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/admin/verify`, {
    headers: { "x-admin-token": token },
  });
  return res.ok;
}

export async function startRound(
  newRoundId: string,
  candidates: Candidate[],
  mode: RoundMode = "talent"
): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/round/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminHeaders() },
    body: JSON.stringify({ new_round_id: newRoundId, candidates, mode }),
  });
  if (!res.ok) throw new Error(`start round failed: ${res.status}`);
}

export async function setRoundState(state: RoundState): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/round/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminHeaders() },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw new Error(`set state failed: ${res.status}`);
}

export async function startSong(
  candidateId: string,
  songLabel: string
): Promise<SongSession> {
  const res = await fetch(`${API_BASE}/admin/round/song`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminHeaders() },
    body: JSON.stringify({ candidate_id: candidateId, song_label: songLabel }),
  });
  if (!res.ok) throw new Error(`start song failed: ${res.status}`);
  return res.json();
}
