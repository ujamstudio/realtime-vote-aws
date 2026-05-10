import { useEffect, useState } from "react";
import {
  Candidate,
  CurrentRound,
  RoundMode,
  fetchCurrentRound,
  setRoundState,
  startRound,
  startSong,
} from "../lib/api";

interface DraftCandidate {
  key: number;
  id: string;
  name: string;
}

export default function AdminControl() {
  const [current, setCurrent] = useState<CurrentRound | null>(null);
  const [loadError, setLoadError] = useState<string>("");
  const [busy, setBusy] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [actionMsg, setActionMsg] = useState<string>("");

  // start-round form state
  const [newRoundId, setNewRoundId] = useState<string>("");
  const [newMode, setNewMode] = useState<RoundMode>("talent");
  const [draft, setDraft] = useState<DraftCandidate[]>([
    { key: 1, id: "cand_A", name: "" },
    { key: 2, id: "cand_B", name: "" },
  ]);

  // hidden_singer song-session form state
  const [songCandidate, setSongCandidate] = useState<string>("");
  const [songLabel, setSongLabel] = useState<string>("");

  async function refresh() {
    setLoadError("");
    try {
      const data = await fetchCurrentRound();
      setCurrent(data);
      // Only seed the input on first load. Use functional setState so the
      // 4s polling interval (which captures a stale newRoundId of "") doesn't
      // overwrite whatever the user has typed.
      const next = nextRoundId(data.round_id);
      setNewRoundId((prev) => (prev ? prev : next));
    } catch (e) {
      if (e instanceof Error && e.message.includes("404")) {
        setCurrent(null);
        setNewRoundId((prev) => (prev ? prev : "round_001"));
      } else {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addCandidate() {
    const nextKey = draft.length === 0 ? 1 : Math.max(...draft.map((d) => d.key)) + 1;
    const letter = String.fromCharCode(64 + draft.length + 1);
    setDraft([...draft, { key: nextKey, id: `cand_${letter}`, name: "" }]);
  }

  function removeCandidate(key: number) {
    setDraft(draft.filter((d) => d.key !== key));
  }

  function updateCandidate(key: number, patch: Partial<DraftCandidate>) {
    setDraft(draft.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  async function handleStartRound() {
    if (!newRoundId.trim()) {
      setActionError("라운드 이름을 입력해주세요.");
      return;
    }
    const candidates: Candidate[] = draft
      .map((d) => ({ id: d.id.trim(), name: d.name.trim() }))
      .filter((c) => c.id && c.name);
    if (candidates.length < 2) {
      setActionError("후보를 2명 이상 입력해주세요 (이름 필수).");
      return;
    }
    const ids = new Set(candidates.map((c) => c.id));
    if (ids.size !== candidates.length) {
      setActionError("후보 ID가 중복돼요.");
      return;
    }
    setBusy("starting");
    setActionError("");
    setActionMsg("");
    try {
      await startRound(newRoundId.trim(), candidates, newMode);
      setActionMsg(
        newMode === "hidden_singer"
          ? `라운드 시작 — ${newRoundId} (히든싱어, 곡을 시작해주세요)`
          : `라운드 시작 — ${newRoundId} (마감 상태, 투표 오픈을 눌러주세요)`
      );
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function handleToggle(state: "open" | "closed") {
    setBusy(state);
    setActionError("");
    setActionMsg("");
    try {
      await setRoundState(state);
      setActionMsg(state === "open" ? "투표가 열렸습니다" : "투표가 마감됐습니다");
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function handleReset() {
    if (!current) return;
    const confirmed = window.confirm(
      `'${current.round_id}'의 모든 점수를 0으로 초기화할까요?\n` +
        `(투표는 자동으로 마감 상태가 되며, DynamoDB의 원본 로그는 유지됩니다.)`
    );
    if (!confirmed) return;
    setBusy("reset");
    setActionError("");
    setActionMsg("");
    try {
      await startRound(current.round_id, current.candidates, current.mode);
      setActionMsg(`'${current.round_id}' 점수가 초기화됐습니다 (마감 상태)`);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function handleStartSong() {
    if (!current) return;
    if (!songCandidate) {
      setActionError("이번 곡을 부를 후보를 선택해주세요.");
      return;
    }
    setBusy("song-start");
    setActionError("");
    setActionMsg("");
    try {
      const res = await startSong(songCandidate, songLabel.trim());
      setActionMsg(
        `곡 시작 — ${candidateName(current, res.candidate_id)} ${
          res.song_label ? `『${res.song_label}』` : ""
        }`
      );
      setSongLabel("");
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="control-root mt-root">
      <header className="control-topbar">
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
              <span className="mk-line">CTRL</span>
            </div>
          </div>
          <div className="titles">
            <span className="ks">MT VOTE · 라운드 콘솔</span>
            <h1>라운드 컨트롤러</h1>
          </div>
        </div>
        <a className="dash-link" href="/admin">
          → 집계 대시보드
        </a>
      </header>

      {loadError && <div className="control-error">현재 라운드 조회 실패: {loadError}</div>}

      <section className="control-section">
        <div className="control-section-head">
          <span className="step">현황</span>
          <h2>현재 라운드</h2>
        </div>
        {current ? (
          <div className="status-grid">
            <div className="status-cell">
              <div className="k">Round ID</div>
              <div className="v">{current.round_id}</div>
            </div>
            <div className="status-cell">
              <div className="k">모드</div>
              <div className="v">{modeLabel(current.mode)}</div>
            </div>
            <div className="status-cell">
              <div className="k">참가자</div>
              <div className="v">{current.candidates.length}명</div>
            </div>
            <div className={`status-cell state-${current.state}`}>
              <div className="k">투표 상태</div>
              <div className="v">
                <span className="state-dot" />
                {current.state === "open" ? "OPEN" : "CLOSED"}
              </div>
            </div>
            <div className="status-cell">
              <div className="k">제어</div>
              <div className="action-row">
                {current.mode === "talent" && (
                  <>
                    <button
                      className="ctrl-btn open"
                      disabled={busy !== "" || current.state === "open"}
                      onClick={() => handleToggle("open")}
                    >
                      {busy === "open" ? "..." : "투표 열기"}
                    </button>
                    <button
                      className="ctrl-btn close"
                      disabled={busy !== "" || current.state === "closed"}
                      onClick={() => handleToggle("closed")}
                    >
                      {busy === "closed" ? "..." : "투표 마감"}
                    </button>
                  </>
                )}
                {current.mode === "hidden_singer" && (
                  <button
                    className="ctrl-btn close"
                    disabled={busy !== "" || current.state === "closed"}
                    onClick={() => handleToggle("closed")}
                    title="현재 곡의 좋아요 받기를 종료합니다"
                  >
                    {busy === "closed" ? "..." : "현재 곡 마감"}
                  </button>
                )}
                <button
                  className="ctrl-btn reset"
                  disabled={busy !== ""}
                  onClick={handleReset}
                  title="현재 라운드의 점수만 0으로 초기화 (DynamoDB 로그는 유지)"
                >
                  {busy === "reset" ? "..." : "점수 리셋"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty">아직 시작된 라운드가 없어요. 아래에서 새 라운드를 열어주세요.</div>
        )}
      </section>

      {current && current.mode === "hidden_singer" && (
        <section className="control-section">
          <div className="control-section-head">
            <span className="step">곡</span>
            <h2>히든싱어 곡 진행</h2>
          </div>
          <p className="control-hint">
            후보를 선택하고 곡 이름을 입력한 뒤 "곡 시작"을 누르면 새로운 좋아요 세션이 열려요.
            새 곡을 시작하면 이전 곡은 자동으로 종료됩니다.
          </p>

          {current.current_song && (
            <div className="hs-now-panel">
              <div className="k">현재 곡</div>
              <div className="v">
                <b>{candidateName(current, current.current_song.candidate_id)}</b>
                {current.current_song.song_label && (
                  <span className="hs-song-name"> · 『{current.current_song.song_label}』</span>
                )}
              </div>
              <div className="hs-now-meta mt-tabular">
                좋아요 {current.current_song.likes.toLocaleString()} · 상태{" "}
                {current.state === "open" ? "OPEN" : "CLOSED"}
              </div>
            </div>
          )}

          <div className="form-row">
            <label>이번 곡을 부를 후보</label>
            <select
              className="cand-select"
              value={songCandidate}
              onChange={(e) => setSongCandidate(e.target.value)}
            >
              <option value="">— 선택 —</option>
              {current.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>곡 이름 (선택)</label>
            <input
              type="text"
              value={songLabel}
              onChange={(e) => setSongLabel(e.target.value)}
              placeholder="예: 이름 모를 소녀 / 비워두면 표시되지 않습니다"
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="ctrl-btn primary"
              disabled={busy !== "" || !songCandidate}
              onClick={handleStartSong}
            >
              {busy === "song-start" ? "시작하는 중..." : "곡 시작 (새 좋아요 세션)"}
            </button>
          </div>

          {current.songs && current.songs.length > 0 && (
            <div className="hs-history">
              <div className="hs-history-head">진행 내역</div>
              <ol>
                {current.songs.map((s, i) => (
                  <li key={s.song_id} className={s.song_id === current.current_song?.song_id ? "is-current" : ""}>
                    <span className="hs-idx mt-tabular">{String(i + 1).padStart(2, "0")}</span>
                    <span className="hs-cand">{candidateName(current, s.candidate_id)}</span>
                    {s.song_label && <span className="hs-label">『{s.song_label}』</span>}
                    <span className="hs-likes-num mt-tabular">♥ {s.likes.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <section className="control-section">
        <div className="control-section-head">
          <span className="step">시작</span>
          <h2>새 라운드 열기</h2>
        </div>
        <p className="control-hint">
          라운드를 시작하면 점수는 0으로 초기화되고 투표는 마감 상태로 시작합니다.
          {newMode === "talent"
            ? " 무대 신호와 함께 \"투표 열기\"를 눌러주세요."
            : " 히든싱어 모드에서는 첫 곡을 시작하면 자동으로 투표가 열립니다."}
        </p>

        <div className="form-row">
          <label>모드</label>
          <div className="mode-toggle">
            <button
              type="button"
              className={`mode-btn ${newMode === "talent" ? "active" : ""}`}
              onClick={() => setNewMode("talent")}
            >
              <span className="mode-name">장기자랑</span>
              <span className="mode-desc">한 사람당 한 표</span>
            </button>
            <button
              type="button"
              className={`mode-btn ${newMode === "hidden_singer" ? "active" : ""}`}
              onClick={() => setNewMode("hidden_singer")}
            >
              <span className="mode-name">히든싱어</span>
              <span className="mode-desc">곡당 좋아요 집계</span>
            </button>
          </div>
        </div>

        <div className="form-row">
          <label>라운드 이름</label>
          <input
            type="text"
            value={newRoundId}
            onChange={(e) => setNewRoundId(e.target.value)}
            placeholder="자유 입력 (예: round_001, 본선_1차, semifinal-A)"
          />
          <div className="round-presets">
            <button
              type="button"
              className="preset-btn"
              onClick={() => setNewRoundId("round_001")}
              title="처음부터 round_001로 시작"
            >
              ↺ 처음부터 (round_001)
            </button>
            {current && (
              <button
                type="button"
                className="preset-btn"
                onClick={() => setNewRoundId(nextRoundId(current.round_id))}
                title="현재 라운드 다음 번호로 자동 증가"
              >
                → 다음 라운드 ({nextRoundId(current.round_id)})
              </button>
            )}
          </div>
          <div className="hint-line">
            영문/숫자/한글 모두 사용 가능. 같은 이름을 다시 사용하면 그 라운드의 점수가 0으로 리셋됩니다.
          </div>
        </div>

        <div className="form-row">
          <label>참가 후보</label>
          <div className="cand-input-list">
            {draft.map((d, i) => (
              <div className="cand-input-row" key={d.key}>
                <span className="num-chip mt-tabular">{String(i + 1).padStart(2, "0")}</span>
                <input
                  type="text"
                  className="cand-id"
                  value={d.id}
                  onChange={(e) => updateCandidate(d.key, { id: e.target.value })}
                  placeholder="cand_X"
                />
                <input
                  type="text"
                  className="cand-name"
                  value={d.name}
                  onChange={(e) => updateCandidate(d.key, { name: e.target.value })}
                  placeholder="후보 이름"
                />
                <button
                  type="button"
                  className="row-remove"
                  onClick={() => removeCandidate(d.key)}
                  disabled={draft.length <= 2}
                  aria-label="삭제"
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="row-add" onClick={addCandidate}>
              + 후보 추가
            </button>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="ctrl-btn primary"
            disabled={busy !== ""}
            onClick={handleStartRound}
          >
            {busy === "starting" ? "시작하는 중..." : "라운드 시작"}
          </button>
        </div>
      </section>

      {actionMsg && <div className="action-toast ok">{actionMsg}</div>}
      {actionError && <div className="action-toast err">{actionError}</div>}
    </div>
  );
}

function candidateName(round: CurrentRound, candidateId: string | null): string {
  if (!candidateId) return "—";
  return round.candidates.find((c) => c.id === candidateId)?.name ?? candidateId;
}

function modeLabel(m: RoundMode): string {
  return m === "hidden_singer" ? "히든싱어" : "장기자랑";
}

function nextRoundId(current: string): string {
  const m = current.match(/^(.*?)(\d+)$/);
  if (!m) return current + "_2";
  const prefix = m[1];
  const num = parseInt(m[2], 10) + 1;
  return prefix + String(num).padStart(m[2].length, "0");
}
