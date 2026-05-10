import { useEffect, useMemo, useRef, useState } from "react";
import { CurrentRound, RoundMode, fetchCurrentRound } from "../lib/api";

type ConnectionState = "live" | "connecting" | "reconnecting" | "offline";

const POLL_MS = 2000;

const CHART_HEX = [
  "#C8312B", "#2E5A8C", "#D4AF74", "#4A7B5C",
  "#B5651D", "#6B4F8E", "#8B7355", "#94553B",
];

interface ScoreEntry {
  id: string;
  name: string;
  score: number;
}

export default function AdminDashboard() {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [data, setData] = useState<CurrentRound | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const prevScoresRef = useRef<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const deltaTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let consecutiveErrors = 0;

    const tick = async () => {
      try {
        const fresh = await fetchCurrentRound();
        if (cancelled) return;
        consecutiveErrors = 0;
        setConnection("live");

        const prev = prevScoresRef.current;
        const newDeltas: Record<string, number> = {};
        const flat: Record<string, number> = {};
        for (const c of fresh.candidates) {
          const score = c.score ?? 0;
          flat[c.id] = score;
          const diff = score - (prev[c.id] ?? score);
          if (diff > 0) newDeltas[c.id] = diff;
        }
        prevScoresRef.current = flat;
        setData(fresh);

        if (Object.keys(newDeltas).length > 0) {
          setDeltas((d) => {
            const merged = { ...d };
            for (const [id, n] of Object.entries(newDeltas)) {
              merged[id] = (merged[id] ?? 0) + n;
            }
            return merged;
          });
          for (const id of Object.keys(newDeltas)) {
            const existing = deltaTimersRef.current.get(id);
            if (existing) window.clearTimeout(existing);
            const t = window.setTimeout(() => {
              setDeltas((d) => {
                const next = { ...d };
                delete next[id];
                return next;
              });
              deltaTimersRef.current.delete(id);
            }, 2500);
            deltaTimersRef.current.set(id, t);
          }
        }
      } catch {
        if (cancelled) return;
        consecutiveErrors += 1;
        if (consecutiveErrors >= 2) setConnection("reconnecting");
      }
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      for (const t of deltaTimersRef.current.values()) window.clearTimeout(t);
      deltaTimersRef.current.clear();
    };
  }, []);

  const mode: RoundMode = data?.mode ?? "talent";
  const candidates: ScoreEntry[] = useMemo(
    () =>
      (data?.candidates ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        score: c.score ?? 0,
      })),
    [data]
  );
  const total = candidates.reduce((s, c) => s + c.score, 0);

  const ranks = useMemo(() => {
    const order = [...candidates].sort((a, b) => b.score - a.score);
    const map = new Map<string, number>();
    order.forEach((c, i) => map.set(c.id, i + 1));
    return map;
  }, [candidates]);

  const leader = candidates.length > 0
    ? [...candidates].sort((a, b) => b.score - a.score)[0]
    : null;
  const leaderIndex = leader ? candidates.findIndex((c) => c.id === leader.id) : -1;

  const max = Math.max(...candidates.map((c) => c.score), 1);
  const niceMax = Math.max(50, Math.ceil(max / 50) * 50 * 1.15);
  const yTicks = 5;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round((niceMax * i) / yTicks)
  );

  const clockTime = new Date(now).toLocaleTimeString("en-US", { hour12: false });

  const candidateNameOf = (cid: string | null | undefined) =>
    cid ? candidates.find((c) => c.id === cid)?.name ?? cid : "—";

  return (
    <div className="admin-root mt-root">
      <div className="admin-topbar">
        <div className="brand-row">
          <div className="admin-mark">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                lineHeight: 1,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800 }}>관리</span>
              <span className="mk-line">MT</span>
            </div>
          </div>
          <div className="titles">
            <span className="ks">MT VOTE · 실시간 집계실</span>
            <h1>실시간 집계 대시보드</h1>
          </div>
        </div>
        <div className="right">
          <span className="admin-clock mt-tabular">{clockTime}</span>
          <StatusPill kind={connection} />
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-card">
          <div className="k">Round</div>
          <div className="v">{data?.round_id ?? "—"}</div>
          <div className="sub">
            {modeLabel(mode)} · 참가자 {candidates.length}명
          </div>
        </div>
        <div className="stat-card">
          <div className="k">{mode === "hidden_singer" ? "총 좋아요" : "총 투표 수"}</div>
          <div className="v">
            <CountUp value={total} />
          </div>
          <div className="sub">실시간 누적</div>
        </div>
        <div className="stat-card lead">
          <div className="k">선두</div>
          <div
            className="v"
            style={{ color: leaderIndex >= 0 ? CHART_HEX[leaderIndex % 8] : undefined }}
          >
            {leader ? leader.name : "—"}
          </div>
          <div className="sub mt-tabular">
            {leader ? (
              <>
                <CountUp value={leader.score} /> {mode === "hidden_singer" ? "♥" : "표"} ·{" "}
                {total > 0 ? ((leader.score / total) * 100).toFixed(1) : "0.0"}%
              </>
            ) : (
              "집계 중..."
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="k">투표 상태</div>
          <div className="v" style={{ fontSize: 18 }}>
            {data?.state === "open" ? "OPEN" : "CLOSED"}
          </div>
          <div className="sub">
            {connection === "live"
              ? `${POLL_MS / 1000}초 주기로 갱신`
              : connection === "reconnecting"
              ? "재연결 중"
              : "연결 중"}
          </div>
        </div>
      </div>

      {mode === "hidden_singer" && data?.current_song && (
        <div className="hs-current-banner">
          <div className="hs-cb-left">
            <span className="hs-cb-eyebrow">NOW PLAYING</span>
            <div className="hs-cb-title">
              <b>{candidateNameOf(data.current_song.candidate_id)}</b>
              {data.current_song.song_label && (
                <span className="hs-cb-song"> · 『{data.current_song.song_label}』</span>
              )}
            </div>
          </div>
          <div className="hs-cb-right mt-tabular">
            <span className="hs-cb-heart">♥</span>
            <CountUp value={data.current_song.likes} />
            <span className="hs-cb-label">현재 곡 좋아요</span>
          </div>
        </div>
      )}

      <div className="admin-chart-wrap">
        <div className="admin-chart-head">
          <h2>
            {mode === "hidden_singer" ? "후보별 누적 좋아요" : "실시간 득표 그래프"}
          </h2>
          <div className="legend">
            <span className="lk">
              <span className="sw" style={{ background: "var(--gold)" }} />
              선두
            </span>
            <span className="lk">
              <span className="sw" style={{ background: "var(--panel-3)" }} />
              그 외
            </span>
          </div>
        </div>
        <div className="admin-chart" role="img" aria-label="실시간 집계 그래프">
          <div className="chart-y">
            {tickValues.map((v, i) => (
              <div key={i}>{v.toLocaleString()}</div>
            ))}
          </div>
          <div className="chart-canvas">
            <div className="chart-grid">
              {tickValues.slice(1).map((_, i) => (
                <div key={i} />
              ))}
            </div>
            <div className="chart-bars">
              {candidates.map((c, i) => {
                const pct = niceMax > 0 ? (c.score / niceMax) * 100 : 0;
                const sharePct = total > 0 ? (c.score / total) * 100 : 0;
                const isLeader = ranks.get(c.id) === 1;
                const hex = CHART_HEX[i % 8];
                return (
                  <div key={c.id} className="chart-bar-col">
                    <div
                      className={`chart-bar ${isLeader ? "leader" : ""}`}
                      style={{
                        height: `${pct}%`,
                        background: isLeader
                          ? `linear-gradient(180deg, ${hex} 0%, ${hex}d0 65%, ${hex}90 100%)`
                          : `linear-gradient(180deg, ${hex}d0 0%, ${hex}90 100%)`,
                        ["--leader-glow" as string]: `${hex}55`,
                      } as React.CSSProperties}
                    >
                      <span className="bar-pct">{sharePct.toFixed(1)}%</span>
                      <span className="bar-val">
                        <CountUp value={c.score} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div />
          <div className="chart-x">
            {candidates.map((c) => (
              <div key={c.id} className={ranks.get(c.id) === 1 ? "is-leader" : ""}>
                {ranks.get(c.id) === 1 && <span className="leader-pip" />}
                {c.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="cards-row">
        {candidates.map((c, i) => {
          const sharePct = total > 0 ? (c.score / total) * 100 : 0;
          const r = ranks.get(c.id) ?? 0;
          const d = deltas[c.id] ?? 0;
          const hex = CHART_HEX[i % 8];
          const isLead = r === 1;
          return (
            <div
              key={c.id}
              className={`score-card ${isLead ? "leader" : ""}`}
              style={{
                ["--card-glow" as string]: `${hex}22`,
                ["--card-border" as string]: `${hex}55`,
                ["--fill-glow" as string]: `${hex}55`,
              } as React.CSSProperties}
            >
              <div className="stripe" style={{ background: hex }} />
              <div className="name-row">
                <span className="name">
                  <span
                    className="num-chip mt-tabular"
                    style={isLead ? { background: `${hex}33`, color: hex } : {}}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {c.name}
                </span>
                <span className="rank" data-rank={r}>
                  {r}위
                </span>
              </div>
              <div className="score" style={{ color: isLead ? hex : "var(--text)" }}>
                <CountUp value={c.score} />
              </div>
              <div className={`delta ${d > 0 ? "up" : ""}`}>
                {d > 0 ? (
                  <>
                    <svg width="9" height="9" viewBox="0 0 12 12">
                      <path d="M6 2l4 5H2z" fill="currentColor" />
                    </svg>
                    +{d} 방금
                  </>
                ) : (
                  <span style={{ opacity: 0.4 }}>—</span>
                )}
              </div>
              <div className="pct-bar">
                <div
                  className="fill"
                  style={{
                    width: `${sharePct}%`,
                    background: `linear-gradient(90deg, ${hex} 0%, ${hex}cc 100%)`,
                  }}
                />
              </div>
              <div className="pct-text">점유율 {sharePct.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>

      {mode === "hidden_singer" && data?.songs && data.songs.length > 0 && (
        <div className="hs-history-wrap">
          <h2>곡별 좋아요 내역</h2>
          <table className="hs-table mt-tabular">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th>후보</th>
                <th>곡</th>
                <th style={{ width: 120, textAlign: "right" }}>좋아요</th>
              </tr>
            </thead>
            <tbody>
              {data.songs.map((s, i) => {
                const isCurrent = s.song_id === data.current_song?.song_id;
                return (
                  <tr key={s.song_id} className={isCurrent ? "is-current" : ""}>
                    <td>{String(i + 1).padStart(2, "0")}</td>
                    <td>
                      <b>{candidateNameOf(s.candidate_id)}</b>
                      {isCurrent && <span className="hs-now-pill">진행 중</span>}
                    </td>
                    <td>{s.song_label || <span style={{ opacity: 0.4 }}>(이름 없음)</span>}</td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ color: "var(--red)" }}>♥</span>{" "}
                      {s.likes.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function modeLabel(m: RoundMode): string {
  return m === "hidden_singer" ? "히든싱어" : "장기자랑";
}

function StatusPill({ kind }: { kind: ConnectionState }) {
  const labels: Record<ConnectionState, string> = {
    live: "LIVE",
    connecting: "연결 중",
    reconnecting: "재연결 중",
    offline: "오프라인",
  };
  return (
    <span className="status-pill" data-kind={kind}>
      <span className="lamp" />
      {labels[kind]}
    </span>
  );
}

function CountUp({ value, duration = 200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const diff = Math.abs(to - from);
    if (diff > 50) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }
    cancelAnimationFrame(rafRef.current);
    startRef.current = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(from + (to - from) * eased);
      setDisplay(cur);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <span className="mt-tabular">{display.toLocaleString("en-US")}</span>;
}
