import { expect, test } from "@playwright/test";
import {
  fetchCurrentRound,
  setRoundState,
  startRound,
  startSong,
  waitForScore,
  waitForSongLikes,
} from "./api";

const TALENT_ROUND = "e2e_talent";
const HIDDEN_ROUND = "e2e_hidden";
const TEST_CANDIDATES = [
  { id: "cand_E1", name: "테스트가수원" },
  { id: "cand_E2", name: "테스트가수투" },
];

// Each test asserts against the deployed mobile UI on iPhone 13 viewport.

test.describe("Talent mode (장기자랑) voter flow", () => {
  test.beforeAll(async () => {
    await startRound(TALENT_ROUND, TEST_CANDIDATES, "talent");
    await setRoundState("open");
  });

  test("voter sees candidates and can submit a vote", async ({ page, context }) => {
    // Fresh device fingerprint each run so localStorage doesn't carry over.
    await context.clearCookies();
    await page.goto("/vote");

    // Header copy
    await expect(page.getByText("MT VOTE · 실시간 투표")).toBeVisible();
    await expect(page.locator(".vote-header h1")).toContainText("당신의 선택은");
    await expect(page.locator(".round-tag")).toContainText("장기자랑");

    // Candidates rendered
    await expect(page.getByText(TEST_CANDIDATES[0].name)).toBeVisible();
    await expect(page.getByText(TEST_CANDIDATES[1].name)).toBeVisible();

    // Submit a vote
    await page.getByRole("button", { name: `${TEST_CANDIDATES[0].name} 선택` }).click();

    // Done card heading appears (also covers the toast which has the same text)
    await expect(page.locator(".done-card h2")).toHaveText("투표가 접수됐어요", { timeout: 10_000 });
    await expect(page.locator(".your-pick")).toContainText(TEST_CANDIDATES[0].name);

    // Verify the score actually moved server-side
    const score = await waitForScore(TEST_CANDIDATES[0].id, 1);
    expect(score).toBeGreaterThanOrEqual(1);
  });

  test("voter sees CLOSED card when round is closed", async ({ page }) => {
    await setRoundState("closed");
    await page.goto("/vote");
    await expect(page.locator(".closed-card h2")).toContainText("아직 투표가 열리지");
    await setRoundState("open");
  });
});

test.describe("Hidden singer mode (히든싱어) voter flow", () => {
  let songId: string;

  test.beforeAll(async () => {
    await startRound(HIDDEN_ROUND, TEST_CANDIDATES, "hidden_singer");
    const song = await startSong(TEST_CANDIDATES[0].id, "테스트 곡 - 애국가");
    songId = song.song_id;
  });

  test("voter sees current song and can tap like", async ({ page, context }) => {
    await context.clearCookies();
    // Wipe localStorage so prior liked-song state doesn't block us.
    await page.goto("/vote");
    await page.evaluate(() => localStorage.clear());

    await page.goto("/vote");

    // Header
    await expect(page.getByText("MT VOTE · 히든싱어")).toBeVisible();
    await expect(page.locator(".round-tag")).toContainText("히든싱어");

    // Stage shows current candidate name + song label
    await expect(page.locator(".hs-singer")).toHaveText(TEST_CANDIDATES[0].name);
    await expect(page.locator(".hs-song-title")).toContainText("애국가");

    // Like button is enabled and clickable
    const likeBtn = page.getByRole("button", { name: "이 곡에 좋아요" });
    await expect(likeBtn).toBeEnabled();
    await likeBtn.click();

    // Toast + done state
    await expect(page.getByText("좋아요 접수됐어요")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".hs-done-mark")).toContainText("좋아요 접수됨");

    // Server-side: like should be tallied within 5s thanks to the SQS
    // batching-window=0 fix.
    const likes = await waitForSongLikes(songId, 1, 10_000);
    expect(likes).toBeGreaterThanOrEqual(1);

    // Candidate's cumulative score should also have incremented.
    const candScore = await waitForScore(TEST_CANDIDATES[0].id, 1);
    expect(candScore).toBeGreaterThanOrEqual(1);
  });

  test("starting a new song resets the per-song like-button", async ({ page, context }) => {
    // First like with one device
    await context.clearCookies();
    await page.goto("/vote");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const likeBtn = page.getByRole("button", { name: "이 곡에 좋아요" });
    await likeBtn.click();
    await expect(page.locator(".hs-done-mark")).toBeVisible();

    // Admin starts a NEW song for cand_E2.
    const newSong = await startSong(TEST_CANDIDATES[1].id, "테스트 곡 2");

    // The voter UI polls every 3s; wait for it to switch.
    await expect(page.locator(".hs-singer")).toHaveText(TEST_CANDIDATES[1].name, { timeout: 10_000 });
    // Like button is enabled again because it's a new song session.
    await expect(page.getByRole("button", { name: "이 곡에 좋아요" })).toBeEnabled();

    // Tap like for the new song
    await page.getByRole("button", { name: "이 곡에 좋아요" }).click();
    await expect(page.locator(".hs-done-mark")).toBeVisible();

    // Verify second song got one like
    const likes = await waitForSongLikes(newSong.song_id, 1, 10_000);
    expect(likes).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Smoke checks", () => {
  test("/round/current returns a valid response", async () => {
    const round = await fetchCurrentRound();
    expect(round).toHaveProperty("round_id");
    expect(round).toHaveProperty("mode");
    expect(["talent", "hidden_singer"]).toContain(round.mode);
  });
});
