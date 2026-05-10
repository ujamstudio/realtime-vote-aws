import { useEffect, useState } from "react";
import { getToken, setToken } from "../lib/auth";
import { verifyAdminToken } from "../lib/api";

type Phase = "loading" | "needs-password" | "verifying" | "ok";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const existing = getToken();
    if (!existing) {
      setPhase("needs-password");
      return;
    }
    verifyAdminToken(existing)
      .then((ok) => {
        if (ok) setPhase("ok");
        else setPhase("needs-password");
      })
      .catch(() => setPhase("needs-password"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw) return;
    setPhase("verifying");
    setError("");
    try {
      const ok = await verifyAdminToken(pw);
      if (ok) {
        setToken(pw);
        setPhase("ok");
      } else {
        setError("비밀번호가 올바르지 않사옵니다.");
        setPhase("needs-password");
      }
    } catch {
      setError("서버에 연결할 수 없사옵니다.");
      setPhase("needs-password");
    }
  }

  if (phase === "ok") return <>{children}</>;

  return (
    <div className="gate-screen mt-root">
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-mark" aria-hidden>
          <span>관리</span>
        </div>
        <h1>관리자 입장</h1>
        <p>관리자 비밀번호를 입력하시오.</p>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          disabled={phase === "verifying" || phase === "loading"}
          placeholder="비밀번호"
          autoComplete="current-password"
        />
        {error && <div className="gate-error">{error}</div>}
        <button
          type="submit"
          className="gate-btn"
          disabled={phase === "verifying" || phase === "loading" || !pw}
        >
          {phase === "verifying" ? "확인 중..." : "들어가기"}
        </button>
      </form>
    </div>
  );
}
