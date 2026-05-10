import { useEffect, useMemo, useRef, useState } from "react";
import {
  Candidate,
  CurrentRound,
  RoundMode,
  SongSession,
  fetchCurrentRound,
  submitLike,
  submitVote,
} from "../lib/api";
import { getDeviceId } from "../lib/deviceId";

type Phase =
  | "loading"
  | "closed"
  | "ready"
  | "submitting"
  | "done"
  | "error";
type ButtonState = "idle" | "selected" | "submitted";

const VOTED_KEY = "mtvote_voted_round";
const LIKED_SONGS_KEY = "mtvote_liked_songs";

export default function VotePage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [round, setRound] = useState<CurrentRound | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [votedId, setVotedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [showToast, setShowToast] = useState<boolean>(false);
  const [likedSongs, setLikedSongs] = useState<Set<string>>(() => loadLikedSongs());
  const submittingRef = useRef(false);

  const mode: RoundMode = round?.mode ?? "talent";
  const roundId = round?.round_id ?? "";
  const currentSong = round?.current_song ?? null;
  const candidates = round?.candidates ?? [];

  useEffect(() => {
    let cancelled = false;

    const fetchAndApply = async () => {
      try {
        const data = await fetchCurrentRound();
        if (cancelled) return;
        setRound(data);
        const lastVoted = localStorage.getItem(VOTED_KEY);

        if (data.mode === "hidden_singer") {
          // For hidden_singer, "done" is per-song. The phase reflects current song state.
          if (data.state !== "open" || !data.current_song) {
            setPhase("closed");
          } else {
            const liked = loadLikedSongs();
            if (liked.has(data.current_song.song_id)) {
              setPhase("done");
            } else {
              setPhase((p) =>
                p === "submitting" || p === "done" || p === "error" ? p : "ready"
              );
            }
          }
        } else {
          // Talent mode: one vote per round.
          if (lastVoted === data.round_id) {
            setPhase("done");
          } else if (data.state !== "open") {
            setPhase("closed");
          } else {
            setPhase((p) => (p === "loading" ? "ready" : p));
          }
        }
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    };

    fetchAndApply();
    const id = window.setInterval(fetchAndApply, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // When the song changes (new session), reset done state if user hasn't liked it yet.
  useEffect(() => {
    if (mode !== "hidden_singer" || !currentSong) return;
    if (phase === "done" && !likedSongs.has(currentSong.song_id)) {
      setPhase("ready");
      setPendingId(null);
      setVotedId(null);
    }
  }, [currentSong?.song_id, mode, phase, likedSongs]);

  async function castVote(c: Candidate) {
    if (submittingRef.current || phase !== "ready") return;
    submittingRef.current = true;
    setPendingId(c.id);
    setPhase("submitting");
    try {
      await submitVote(c.id, getDeviceId());
      localStorage.setItem(VOTED_KEY, roundId);
      setVotedId(c.id);
      setShowToast(true);
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("ready");
      setPendingId(null);
    } finally {
      submittingRef.current = false;
    }
  }

  async function tapLike(song: SongSession) {
    if (submittingRef.current || phase !== "ready") return;
    submittingRef.current = true;
    setPendingId(song.song_id);
    setPhase("submitting");
    try {
      await submitLike(song.song_id, getDeviceId());
      const next = new Set(likedSongs);
      next.add(song.song_id);
      saveLikedSongs(next);
      setLikedSongs(next);
      setVotedId(song.candidate_id);
      setShowToast(true);
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("ready");
      setPendingId(null);
    } finally {
      submittingRef.current = false;
    }
  }

  if (mode === "hidden_singer") {
    return (
      <HiddenSingerView
        roundId={roundId}
        candidates={candidates}
        currentSong={currentSong}
        phase={phase}
        pendingId={pendingId}
        likedSongs={likedSongs}
        errorMsg={errorMsg}
        showToast={showToast}
        onLike={tapLike}
        onDismissToast={() => setShowToast(false)}
        onRetry={() => {
          setErrorMsg("");
          setPhase("loading");
        }}
      />
    );
  }

  return (
    <TalentView
      roundId={roundId}
      candidates={candidates}
      phase={phase}
      pendingId={pendingId}
      votedId={votedId}
      errorMsg={errorMsg}
      showToast={showToast}
      onVote={castVote}
      onDismissToast={() => setShowToast(false)}
      onRetry={() => {
        setErrorMsg("");
        setPhase("loading");
      }}
    />
  );
}

// ---------------- Talent (장기자랑) view ----------------

function TalentView({
  roundId,
  candidates,
  phase,
  pendingId,
  votedId,
  errorMsg,
  showToast,
  onVote,
  onDismissToast,
  onRetry,
}: {
  roundId: string;
  candidates: Candidate[];
  phase: Phase;
  pendingId: string | null;
  votedId: string | null;
  errorMsg: string;
  showToast: boolean;
  onVote: (c: Candidate) => void;
  onDismissToast: () => void;
  onRetry: () => void;
}) {
  const indexedCandidates = useMemo(
    () => candidates.map((c, i) => ({ ...c, displayNum: i + 1 })),
    [candidates]
  );

  return (
    <div className="vote-screen mt-root">
      <div className="top-rule" />

      <header className="vote-header">
        <span className="vote-eyebrow">
          <span className="eb-line" />
          <span className="live-dot" />
          MT VOTE · 실시간 투표
          <span className="eb-line" />
        </span>
        <h1>
          오늘의 무대,
          <br />
          <span className="accent">당신의 선택은</span>?
        </h1>
        <div className="vote-subtitle">
          한 무대당 한 번, 가장 마음에 드는 후보에게 투표해주세요.
        </div>
        <div className="meta-row">
          <span className="round-tag">
            <span className="round-dot" />
            장기자랑 · {roundId || "—"}
          </span>
        </div>
      </header>

      {phase === "loading" && (
        <div className="sk-list" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="sk-row" />
          ))}
        </div>
      )}

      {phase === "closed" && (
        <ClosedCard
          title="아직 투표가 열리지 않았어요"
          body={<>잠시만 기다려주세요.<br />투표가 시작되면 자동으로 화면이 바뀝니다.</>}
        />
      )}

      {(phase === "ready" || phase === "submitting") && (
        <div className="cand-list">
          {indexedCandidates.map((c) => {
            const state: ButtonState = pendingId === c.id ? "selected" : "idle";
            const disabled = phase === "submitting" && pendingId !== c.id;
            return (
              <CandidateButton
                key={c.id}
                num={c.displayNum}
                name={c.name}
                state={state}
                disabled={disabled}
                onSelect={() => onVote(c)}
              />
            );
          })}
        </div>
      )}

      {phase === "done" && (
        <>
          <div className="cand-list" style={{ opacity: 0.55, pointerEvents: "none" }}>
            {indexedCandidates.map((c) => (
              <CandidateButton
                key={c.id}
                num={c.displayNum}
                name={c.name}
                state={votedId === c.id ? "submitted" : "idle"}
                disabled
                onSelect={() => {}}
              />
            ))}
          </div>
          <DoneCard
            title="투표가 접수됐어요"
            body={<>다음 무대를 기다려주세요.<br />결과는 무대에서 공개됩니다.</>}
            footer={
              votedId ? (
                <span className="your-pick">
                  <span className="yp-num mt-tabular">
                    {String(
                      indexedCandidates.find((c) => c.id === votedId)?.displayNum ?? 0
                    ).padStart(2, "0")}
                  </span>
                  내 선택 · <b>{indexedCandidates.find((c) => c.id === votedId)?.name}</b>
                </span>
              ) : null
            }
          />
        </>
      )}

      {phase === "error" && <ErrorCard message={errorMsg} onRetry={onRetry} />}

      {showToast && <Toast onDone={onDismissToast}>투표가 접수됐어요</Toast>}
    </div>
  );
}

// ---------------- Hidden singer (히든싱어) view ----------------

function HiddenSingerView({
  roundId,
  candidates,
  currentSong,
  phase,
  pendingId,
  likedSongs,
  errorMsg,
  showToast,
  onLike,
  onDismissToast,
  onRetry,
}: {
  roundId: string;
  candidates: Candidate[];
  currentSong: SongSession | null;
  phase: Phase;
  pendingId: string | null;
  likedSongs: Set<string>;
  errorMsg: string;
  showToast: boolean;
  onLike: (s: SongSession) => void;
  onDismissToast: () => void;
  onRetry: () => void;
}) {
  const candidateName = useMemo(() => {
    if (!currentSong?.candidate_id) return null;
    return candidates.find((c) => c.id === currentSong.candidate_id)?.name ?? null;
  }, [candidates, currentSong]);

  const alreadyLiked = currentSong ? likedSongs.has(currentSong.song_id) : false;
  const liveLikes = currentSong?.likes ?? 0;

  return (
    <div className="vote-screen vote-hs mt-root">
      <div className="top-rule" />

      <header className="vote-header">
        <span className="vote-eyebrow">
          <span className="eb-line" />
          <span className="live-dot" />
          MT VOTE · 히든싱어
          <span className="eb-line" />
        </span>
        <h1>
          이 무대,
          <br />
          <span className="accent">좋았다면 좋아요</span>!
        </h1>
        <div className="vote-subtitle">
          노래가 바뀔 때마다 한 번씩, 마음에 드는 만큼 눌러주세요.
        </div>
        <div className="meta-row">
          <span className="round-tag">
            <span className="round-dot" />
            히든싱어 · {roundId || "—"}
          </span>
        </div>
      </header>

      {phase === "loading" && (
        <div className="sk-list" aria-busy="true">
          <div className="sk-row" style={{ height: 220 }} />
        </div>
      )}

      {phase === "closed" && (
        <ClosedCard
          title="다음 무대를 준비 중이에요"
          body={<>곧 다음 곡이 시작됩니다.<br />이 화면이 자동으로 바뀌어요.</>}
        />
      )}

      {(phase === "ready" || phase === "submitting") && currentSong && (
        <div className="hs-stage">
          <div className="hs-now">NOW PLAYING</div>
          <div className="hs-singer">{candidateName ?? "??"}</div>
          {currentSong.song_label && (
            <div className="hs-song-title">『{currentSong.song_label}』</div>
          )}
          <div className="hs-likes mt-tabular">
            <span className="heart">♥</span>
            <span>{liveLikes.toLocaleString()}</span>
            <span className="hs-likes-label">좋아요</span>
          </div>
          <button
            type="button"
            className="hs-like-btn"
            disabled={phase === "submitting" || alreadyLiked}
            onClick={() => onLike(currentSong)}
            aria-label="이 곡에 좋아요"
          >
            {phase === "submitting" && pendingId === currentSong.song_id ? (
              <span className="spinner" aria-hidden />
            ) : (
              <>
                <span className="hs-like-heart">♥</span>
                <span className="hs-like-text">좋아요</span>
              </>
            )}
          </button>
          <div className="hs-rule">곡당 한 번만 누를 수 있어요</div>
        </div>
      )}

      {phase === "done" && currentSong && (
        <div className="hs-stage hs-stage-done">
          <div className="hs-now">감사합니다</div>
          <div className="hs-singer">{candidateName ?? "??"}</div>
          {currentSong.song_label && (
            <div className="hs-song-title">『{currentSong.song_label}』</div>
          )}
          <div className="hs-likes mt-tabular">
            <span className="heart">♥</span>
            <span>{liveLikes.toLocaleString()}</span>
            <span className="hs-likes-label">좋아요</span>
          </div>
          <div className="hs-done-mark">
            <span className="check" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            좋아요 접수됨
          </div>
          <div className="hs-rule">다음 곡이 시작되면 다시 누를 수 있어요</div>
        </div>
      )}

      {phase === "error" && <ErrorCard message={errorMsg} onRetry={onRetry} />}

      {showToast && <Toast onDone={onDismissToast}>좋아요 접수됐어요</Toast>}
    </div>
  );
}

// ---------------- Shared sub-components ----------------

function CandidateButton({
  num,
  name,
  state,
  disabled,
  onSelect,
}: {
  num: number;
  name: string;
  state: ButtonState;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="cand-btn"
      data-state={state}
      disabled={disabled}
      onClick={onSelect}
      aria-label={`${name} 선택`}
    >
      <span className="name">
        <span className="num mt-tabular">{String(num).padStart(2, "0")}</span>
        <span className="label-stack">
          <span className="nm">{name}</span>
          <span className="sub">No. {num}</span>
        </span>
      </span>
      <span className="slot">
        {state === "selected" && <span className="spinner" aria-hidden />}
        {state === "submitted" && (
          <span className="check" aria-hidden>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12.5l4.5 4.5L19 7"
                stroke="currentColor"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        {state === "idle" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </button>
  );
}

function ClosedCard({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="closed-card">
      <div className="badge" aria-hidden>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="11" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth={2} />
          <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth={2} />
        </svg>
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function DoneCard({
  title,
  body,
  footer,
}: {
  title: string;
  body: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="done-card">
      <div className="seal" aria-hidden>
        <span className="seal-inner">
          <span>접수</span>
        </span>
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      {footer}
    </div>
  );
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="err-card">
      <div className="badge">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M12 8v5" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={12} cy={16.5} r={1.3} fill="currentColor" />
          <path
            d="M10.3 3.7L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3l-7.9-13.8a2 2 0 00-3.4 0z"
            stroke="currentColor"
            strokeWidth={2}
          />
        </svg>
      </div>
      <h2>잠시 연결이 끊겼어요</h2>
      <p>
        잠시 후 다시 시도해주세요.
        <br />
        {message ? message : "네트워크 상태를 확인해주세요."}
      </p>
      <button className="retry-btn" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}

function Toast({
  children,
  onDone,
}: {
  children: React.ReactNode;
  onDone: () => void;
}) {
  const [exit, setExit] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setExit(true), 2800);
    const t2 = setTimeout(onDone, 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);
  return (
    <div className="toast-host">
      <div className={`toast ${exit ? "exit" : ""}`}>
        <span className="toast-icon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12.5l4.5 4.5L19 7"
              stroke="currentColor"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {children}
      </div>
    </div>
  );
}

// ---------------- Local persistence helpers ----------------

function loadLikedSongs(): Set<string> {
  try {
    const raw = localStorage.getItem(LIKED_SONGS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr);
    return new Set();
  } catch {
    return new Set();
  }
}

function saveLikedSongs(s: Set<string>) {
  try {
    // Keep only the most recent 200 song_ids to bound storage.
    const arr = Array.from(s).slice(-200);
    localStorage.setItem(LIKED_SONGS_KEY, JSON.stringify(arr));
  } catch {
    // localStorage unavailable — silently ignore; user can re-like (server still rate-limits via state).
  }
}
