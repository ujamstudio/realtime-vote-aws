// store.jsx — shared simulator state for both /vote and /admin

const MTStore = (() => {
  const listeners = new Set();
  let state = {
    roundId: 'round_001',
    candidateCount: 5,
    deadline: Date.now() + 90_000, // 90s
    connection: 'live', // live | connecting | reconnecting | offline
    voteState: 'ready', // loading | ready | submitting | done | error
    votedFor: null,
    voted: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
    deltas: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
    voteFlow: 'auto', // auto = simulate, manual = user-driven
  };

  const get = () => state;
  const set = (patch) => {
    state = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
    listeners.forEach(l => l(state));
  };
  const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

  // simulate vote stream
  let lastTick = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    if (state.connection !== 'live') return;
    // simulate ~12 votes/sec, distributed unevenly
    const baseRate = 12 * dt;
    const next = { ...state.voted };
    const dnext = { ...state.deltas };
    // weights
    const weights = [];
    for (let i = 0; i < state.candidateCount; i++) {
      // give each candidate slightly different popularity
      weights.push(0.5 + Math.sin((i + 1) * 1.7 + now / 9000) * 0.35 + Math.random() * 0.4 + (i === 0 ? 0.3 : 0));
    }
    const total = weights.reduce((a,b)=>a+b,0);
    let added = false;
    for (let i = 0; i < state.candidateCount; i++) {
      const exp = baseRate * weights[i] / total;
      const n = Math.floor(exp) + (Math.random() < (exp % 1) ? 1 : 0);
      if (n > 0) {
        next[i] = (next[i] || 0) + n;
        dnext[i] = (dnext[i] || 0) + n;
        added = true;
      }
    }
    if (added) set({ voted: next, deltas: dnext });
    // decay deltas
    for (const k of Object.keys(dnext)) {
      if (dnext[k] > 0) dnext[k] = Math.max(0, dnext[k] - dt * 4);
    }
  }, 250);

  return { get, set, subscribe };
})();

function useStore() {
  const [s, setS] = React.useState(MTStore.get());
  React.useEffect(() => MTStore.subscribe(setS), []);
  return s;
}

// Pretty candidate name
function candName(i) { return `참가자 ${i + 1}`; }

Object.assign(window, { MTStore, useStore, candName });
