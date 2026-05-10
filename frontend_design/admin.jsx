// admin.jsx — /admin live dashboard

const CHART_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];
const CHART_HEX = ['#C8312B', '#2E5A8C', '#D4AF74', '#4A7B5C', '#B5651D', '#6B4F8E', '#8B7355', '#94553B'];

function CountUp({ value, duration = 200 }) {
  const [display, setDisplay] = React.useState(value);
  const fromRef = React.useRef(value);
  const startRef = React.useRef(0);
  const rafRef = React.useRef(0);

  React.useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const diff = Math.abs(to - from);
    if (diff > 50) { fromRef.current = to; setDisplay(to); return; }
    cancelAnimationFrame(rafRef.current);
    startRef.current = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(from + (to - from) * eased);
      setDisplay(cur);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <span className="mt-tabular">{display.toLocaleString('en-US')}</span>;
}

function StatusPill({ kind }) {
  const labels = { live: 'LIVE', connecting: '연결 중', reconnecting: '재연결 중', offline: '오프라인' };
  return (
    <span className="status-pill" data-kind={kind}>
      <span className="lamp" />
      {labels[kind] || kind}
    </span>
  );
}

function AdminPage({ showCountdown = true }) {
  const s = useStore();
  const candidates = Array.from({ length: s.candidateCount }, (_, i) => i);
  const counts = candidates.map(i => s.voted[i] || 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts, 1);
  // y-axis "nice" max
  const niceMax = Math.max(50, Math.ceil(max / 50) * 50 * 1.15);
  const yTicks = 5;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round(niceMax * i / yTicks));

  // ranking
  const ranks = [...candidates].sort((a, b) => counts[b] - counts[a]);
  const rankOf = {};
  ranks.forEach((idx, r) => { rankOf[idx] = r + 1; });

  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { const id = setInterval(()=>setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const remain = Math.max(0, Math.floor((s.deadline - now) / 1000));
  const mm = Math.floor(remain / 60), ss = remain % 60;
  const warn = remain <= 10 && remain > 0;
  const clockTime = new Date(now).toLocaleTimeString('en-US', { hour12: false });

  return (
    <div className="admin-root">
      <div className="admin-topbar">
        <div className="brand-row">
          <div className="admin-mark">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>御票</span>
              <span className="mk-line">MT</span>
            </div>
          </div>
          <div className="titles">
            <span className="ks">MT VOTE · 御前 集計室</span>
            <h1>실시간 집계 대시보드</h1>
          </div>
        </div>
        <div className="right">
          <span className="admin-clock mt-tabular">{clockTime}</span>
          <StatusPill kind={s.connection} />
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-card">
          <div className="k">Round</div>
          <div className="v">{s.roundId}</div>
          <div className="sub">참가자 {s.candidateCount}명</div>
        </div>
        <div className="stat-card">
          <div className="k">총 투표 수</div>
          <div className="v"><CountUp value={total} /></div>
          <div className="sub">실시간 누적</div>
        </div>
        <div className="stat-card lead">
          <div className="k">선두</div>
          <div className="v" style={{ color: CHART_HEX[ranks[0] % 8] }}>
            {candName(ranks[0])}
          </div>
          <div className="sub mt-tabular">
            <CountUp value={counts[ranks[0]]} /> 표 · {total > 0 ? ((counts[ranks[0]]/total)*100).toFixed(1) : '0.0'}%
          </div>
        </div>
        {showCountdown && (
          <div className={`stat-card ${warn ? 'warn-time' : ''}`}>
            <div className="k">남은 시간</div>
            <div className="v mt-tabular">{mm}:{String(ss).padStart(2,'0')}</div>
            <div className="sub">라운드 마감까지</div>
          </div>
        )}
      </div>

      <div className="admin-chart-wrap">
        <div className="admin-chart-head">
          <h2>실시간 득표 그래프</h2>
          <div className="legend">
            <span className="lk"><span className="sw" style={{ background: 'var(--gold)' }} />선두</span>
            <span className="lk"><span className="sw" style={{ background: 'var(--panel-3)' }} />그 외</span>
          </div>
        </div>
        <div className="admin-chart" role="img" aria-label="실시간 득표 그래프">
          <div className="chart-y">
            {tickValues.map((v, i) => <div key={i}>{v.toLocaleString()}</div>)}
          </div>
          <div className="chart-canvas">
            <div className="chart-grid">
              {tickValues.slice(1).map((_, i) => <div key={i} />)}
            </div>
            <div className="chart-bars">
              {candidates.map(i => {
                const c = counts[i];
                const pct = niceMax > 0 ? (c / niceMax) * 100 : 0;
                const sharePct = total > 0 ? (c / total) * 100 : 0;
                const isLeader = rankOf[i] === 1;
                const hex = CHART_HEX[i % 8];
                return (
                  <div key={i} className="chart-bar-col">
                    <div
                      className={`chart-bar ${isLeader ? 'leader' : ''}`}
                      style={{
                        height: `${pct}%`,
                        background: isLeader
                          ? `linear-gradient(180deg, ${hex} 0%, ${hex}d0 65%, ${hex}90 100%)`
                          : `linear-gradient(180deg, ${hex}d0 0%, ${hex}90 100%)`,
                        '--leader-glow': `${hex}55`,
                      }}
                    >
                      <span className="bar-pct">{sharePct.toFixed(1)}%</span>
                      <span className="bar-val"><CountUp value={c} /></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div />
          <div className="chart-x">
            {candidates.map(i => (
              <div key={i} className={rankOf[i] === 1 ? 'is-leader' : ''}>
                {rankOf[i] === 1 && <span className="leader-pip" />}
                {candName(i)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="cards-row">
        {candidates.map(i => {
          const c = counts[i];
          const sharePct = total > 0 ? (c / total) * 100 : 0;
          const r = rankOf[i];
          const d = Math.round(s.deltas[i] || 0);
          const hex = CHART_HEX[i % 8];
          const isLead = r === 1;
          return (
            <div
              key={i}
              className={`score-card ${isLead ? 'leader' : ''}`}
              style={{ '--card-glow': `${hex}22`, '--card-border': `${hex}55`, '--fill-glow': `${hex}55` }}
            >
              <div className="stripe" style={{ background: hex }} />
              <div className="name-row">
                <span className="name">
                  <span className="num-chip mt-tabular" style={isLead ? { background: `${hex}33`, color: hex } : {}}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {candName(i)}
                </span>
                <span className="rank" data-rank={r}>{r}위</span>
              </div>
              <div className="score" style={{ color: isLead ? hex : 'var(--text)' }}>
                <CountUp value={c} />
              </div>
              <div className={`delta ${d > 0 ? 'up' : ''}`}>
                {d > 0 ? <>
                  <svg width="9" height="9" viewBox="0 0 12 12"><path d="M6 2l4 5H2z" fill="currentColor"/></svg>
                  +{d} 방금
                </> : <span style={{ opacity: 0.4 }}>—</span>}
              </div>
              <div className="pct-bar">
                <div className="fill" style={{ width: `${sharePct}%`, background: `linear-gradient(90deg, ${hex} 0%, ${hex}cc 100%)` }} />
              </div>
              <div className="pct-text">점유율 {sharePct.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { AdminPage });
