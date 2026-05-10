// vote.jsx — Mobile /vote page
// States: loading | ready | submitting | done | error
// Wired to MTStore so taps register against the live tally.

function CountdownPill({ deadline }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remain = Math.max(0, Math.floor((deadline - now) / 1000));
  const m = Math.floor(remain / 60);
  const s = remain % 60;
  const warn = remain <= 10;
  return (
    <span className={`countdown ${warn ? 'warn' : ''}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 9v4l2.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M9 3h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      {m}:{String(s).padStart(2, '0')}
    </span>
  );
}

function CandidateButton({ index, state, label, disabled, onSelect }) {
  return (
    <button
      type="button"
      className="cand-btn"
      data-state={state}
      disabled={disabled}
      onClick={() => onSelect(index)}
      aria-label={`${label} 선택`}
    >
      <span className="name">
        <span className="num mt-tabular">{String(index + 1).padStart(2, '0')}</span>
        <span className="label-stack">
          <span className="nm">{label}</span>
          <span className="sub">No. {index + 1}</span>
        </span>
      </span>
      <span className="slot">
        {state === 'selected' && <span className="spinner" aria-hidden />}
        {state === 'submitted' && (
          <span className="check" aria-hidden>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        )}
        {state === 'idle' && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
    </button>
  );
}

function Toast({ children, onDone }) {
  const [exit, setExit] = React.useState(false);
  React.useEffect(() => {
    const t1 = setTimeout(() => setExit(true), 2800);
    const t2 = setTimeout(() => onDone && onDone(), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div className="toast-host">
      <div className={`toast ${exit ? 'exit' : ''}`}>
        <span className="dot" />
        {children}
      </div>
    </div>
  );
}

function VotePage({ showCountdown = true }) {
  const s = useStore();
  const [pending, setPending] = React.useState(null); // index being submitted
  const [showToast, setShowToast] = React.useState(false);

  // simulate initial loading -> ready
  React.useEffect(() => {
    if (s.voteState === 'loading') {
      const t = setTimeout(() => MTStore.set({ voteState: 'ready' }), 900);
      return () => clearTimeout(t);
    }
  }, [s.voteState]);

  const candidates = React.useMemo(
    () => Array.from({ length: s.candidateCount }, (_, i) => ({ i, label: candName(i) })),
    [s.candidateCount]
  );

  const onSelect = (i) => {
    if (s.voteState !== 'ready') return;
    if (pending != null) return;
    setPending(i);
    MTStore.set({ voteState: 'submitting' });
    // optimistic: increment immediately
    const optimistic = { ...s.voted };
    optimistic[i] = (optimistic[i] || 0) + 1;
    const optimisticDelta = { ...s.deltas };
    optimisticDelta[i] = (optimisticDelta[i] || 0) + 1;
    MTStore.set({ voted: optimistic, deltas: optimisticDelta });

    setTimeout(() => {
      MTStore.set({ voteState: 'done', votedFor: i });
      setPending(null);
      setShowToast(true);
    }, 700);
  };

  const reset = () => {
    MTStore.set({
      voteState: 'ready',
      votedFor: null,
      roundId: `round_${String(parseInt((s.roundId.split('_')[1] || '1'), 10) + 1).padStart(3, '0')}`,
      deadline: Date.now() + 90_000,
      voted: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, 0])),
      deltas: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, 0])),
    });
    setShowToast(false);
  };

  return (
    <div className="vote-screen mt-root">
      <div className="top-rule" />
      <div className="vote-header">
        <span className="vote-eyebrow">
          <span className="eb-line" />
          <span className="live-dot" />
          MT VOTE · 御前投票
          <span className="eb-line" />
        </span>
        <h1>오늘의 무대,<br/><span className="accent">당신의 선택은</span>?</h1>
        <div className="vote-subtitle">한 <span className="hanja">回</span>에 한 번, 마음을 담아 표를 던지소서.</div>
        <div className="meta-row">
          <span className="round-tag">
            <span className="round-dot" />
            Round · {s.roundId}
          </span>
          {showCountdown && <CountdownPill deadline={s.deadline} />}
        </div>
      </div>

      {s.voteState === 'loading' && (
        <div className="sk-list" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="sk-row" />)}
        </div>
      )}

      {(s.voteState === 'ready' || s.voteState === 'submitting') && (
        <div className="cand-list">
          {candidates.map(({ i, label }) => {
            let st = 'idle';
            if (pending === i) st = 'selected';
            const disabled = pending != null && pending !== i;
            return (
              <CandidateButton
                key={i}
                index={i}
                label={label}
                state={st}
                disabled={disabled}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      )}

      {s.voteState === 'done' && (
        <>
          <div className="cand-list" style={{ opacity: 0.55, pointerEvents: 'none' }}>
            {candidates.map(({ i, label }) => (
              <CandidateButton
                key={i}
                index={i}
                label={label}
                state={s.votedFor === i ? 'submitted' : 'idle'}
                disabled
                onSelect={()=>{}}
              />
            ))}
          </div>
          <div className="done-card">
            <div className="seal" aria-hidden>
              <span className="seal-inner">
                <span>御票</span>
              </span>
            </div>
            <h2>표를 받았사옵니다</h2>
            <p>다음 회를 기다려 주시오.<br/>결과는 무대에서 공개됩니다.</p>
            {s.votedFor != null && (
              <span className="your-pick">
                <span className="yp-num mt-tabular">{String(s.votedFor + 1).padStart(2, '0')}</span>
                내 선택 · <b>{candName(s.votedFor)}</b>
              </span>
            )}
            <button className="next-round-btn" onClick={reset}>
              다음 라운드 (데모)
            </button>
          </div>
        </>
      )}

      {s.voteState === 'error' && (
        <div className="err-card">
          <div className="badge">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 8v5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="12" cy="16.5" r="1.3" fill="currentColor"/>
              <path d="M10.3 3.7L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3l-7.9-13.8a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <h2>잠시 통신이 끊겼사옵니다</h2>
          <p>잠시 후 다시 시도해 주시오.<br/>네트워크 상태를 확인해 주시오.</p>
          <button className="retry-btn" onClick={() => MTStore.set({ voteState: 'ready' })}>
            다시 시도
          </button>
        </div>
      )}

      {showToast && (
        <Toast onDone={() => setShowToast(false)}>
          <span className="toast-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          표를 받았사옵니다
        </Toast>
      )}
    </div>
  );
}

Object.assign(window, { VotePage });
