/**
 * Two-user end-to-end game: A turns notes into a quiz (real Anthropic call),
 * plus its study kit, hosts it, B joins by code and answers, A reveals, both
 * see results and B can open the study kit.
 *
 * Run with `npx deepspace test run all` (needs two test accounts; see
 * collab.spec.ts for how to create them). Generation calls the real AI
 * integration, so this spec is slow (~1–2 min) and bills the app owner.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts (see collab.spec.ts).')
test.setTimeout(240_000)

const NOTES = `Cellular respiration converts glucose into ATP. Glycolysis happens in the cytoplasm
and splits one glucose into two pyruvate, netting 2 ATP and 2 NADH without oxygen. Pyruvate
enters the mitochondrial matrix, where the Krebs cycle produces NADH, FADH2, CO2 and 2 ATP per
glucose. The electron transport chain on the inner mitochondrial membrane uses NADH and FADH2
to pump protons; ATP synthase uses the proton gradient to make about 26-28 ATP. Oxygen is the
final electron acceptor and forms water. Without oxygen, cells use fermentation to regenerate NAD+.`

test('host and player play a round in real time', async ({ users }) => {
  const [host, player] = await users(2)

  // ── Host: create a quiz from notes ────────────────────────────────────
  await host.page.goto('/decks/new')
  await host.page.getByLabel('Or paste your notes').fill(NOTES)
  await host.page.getByTestId('generate-deck').click()
  await expect(host.page).toHaveURL(/\/decks\//, { timeout: 30_000 })
  // Ready as soon as questions exist (narration/cover continue in background).
  await expect(host.page.getByTestId('host-game')).toBeVisible({ timeout: 150_000 })
  // The study kit is written alongside narration; the Study kit tab is the default.
  await expect(host.page.getByTestId('study-kit')).toBeVisible({ timeout: 150_000 })
  await expect(host.page.getByTestId('kit-concept').first()).toBeVisible()
  await host.page.getByTestId('tab-key').click()
  await expect(host.page.getByTestId('question-list').locator('li')).not.toHaveCount(0)

  // ── Host: open a lobby ────────────────────────────────────────────────
  await host.page.getByTestId('host-game').click()
  await expect(host.page).toHaveURL(/\/play\/[A-Z2-9]{6}$/, { timeout: 30_000 })
  const code = (await host.page.getByTestId('join-code').innerText()).trim().slice(0, 6)

  // ── Player: join by code; host sees them arrive live ──────────────────
  await player.page.goto('/home')
  await player.page.getByLabel('Game code').fill(code)
  await player.page.getByTestId('join-form').getByRole('button', { name: /join/i }).click()
  await expect(player.page).toHaveURL(new RegExp(`/play/${code}$`))
  await expect(player.page.getByText('You’re in')).toBeVisible({ timeout: 15_000 })
  await expect(host.page.getByTestId('lobby-players').locator('li')).toHaveCount(1, { timeout: 15_000 })

  // ── Round 1 ───────────────────────────────────────────────────────────
  await host.page.getByTestId('start-game').click()
  await expect(player.page.getByTestId('question-prompt')).toBeVisible({ timeout: 15_000 })
  const prompt = await host.page.getByTestId('question-prompt').innerText()
  await expect(player.page.getByTestId('question-prompt')).toHaveText(prompt)

  await player.page.getByTestId('option-0').click()
  await expect(player.page.getByTestId('locked-in')).toBeVisible()
  // Everyone answered → host auto-reveals without waiting for the timer.
  await expect(host.page.getByTestId('answered-count')).toHaveText(/1\/1/, { timeout: 15_000 })
  await expect(player.page.getByTestId('reveal-banner')).toBeVisible({ timeout: 15_000 })
  await expect(host.page.getByTestId('next-question')).toBeVisible()

  // ── End early → both land on results; player gets a recap ─────────────
  await host.page.getByRole('button', { name: 'End game' }).click()
  await host.page.getByRole('button', { name: 'Click again to end now' }).click()
  await expect(host.page.getByTestId('podium')).toBeVisible({ timeout: 15_000 })
  await expect(player.page.getByTestId('podium')).toBeVisible({ timeout: 15_000 })
  await expect(player.page.getByTestId('review-list').locator('li')).toHaveCount(1)
  // The host's study kit unlocks for the player once the game is over.
  await expect(player.page.getByTestId('open-kit')).toBeVisible({ timeout: 15_000 })
  await player.page.getByTestId('get-recap').click()
  await expect(player.page.getByTestId('recap-text')).toBeVisible({ timeout: 90_000 })
})
