# CramClash

**Live quiz battles generated from your own study notes.** Upload a lecture PDF,
Word doc or text, and CramClash writes a multiple-choice quiz grounded only in that
material. Then it runs a real-time game for your study group: a 6-letter join
code or QR code, questions read aloud, answers locking in live, and a leaderboard
that moves at every reveal. When the game ends, each player gets a private AI
recap built from the exact questions *they* missed.

Built on the [DeepSpace SDK](https://docs.deep.space) (Cloudflare Workers +
Durable Objects).

## The flow

1. **Create** (`/decks/new`): drop a PDF/DOCX/TXT/MD or paste notes; pick a question
   count (5–15), a difficulty and narration. Text is extracted in the browser
   (pdf.js / mammoth, lazy-loaded), and the original file goes to the user's
   private storage.
2. **Generate** (background job): Claude writes the questions, which are
   validated and option-shuffled, then saved. The deck is playable right away,
   and ElevenLabs narration plus Gemini cover art fill in afterwards. Progress
   streams live to the deck page.
3. **Host** (`/play/CODE`): the host's screen is the presenter view (code, QR,
   live lobby with presence dots), and players' phones are answer pads. Each
   question reveals automatically when everyone has answered or time runs out.
4. **Results**: podium, full leaderboard, per-question review (your answer vs.
   correct, with explanation), and a one-click **AI study recap**.

## DeepSpace features used, and why

| Feature | Used for | Why it earns its place |
|---|---|---|
| **RecordRoom live records** (`useQuery`) | Game state, scoreboard, lobby, deck progress | The whole game is just records changing; every screen renders from live queries, so refresh/reconnect simply resumes. No hand-rolled sockets. |
| **RBAC schemas** | Answer key and other players' answers hidden; clients can't write game state | Cheating prevention is enforced by the platform, not the UI (see Security). |
| **Server actions** | All game transitions, joining, answering, scoring | Server clock for timing, and one authoritative scorer. |
| **JobRoom** (`enqueueJob`) | Quiz + narration + cover generation | AI calls outlive the request, retry on crash, report progress. |
| **CronRoom** | Hourly cleanup of stale games | Keeps the shared room small; frees join codes. |
| **PresenceRoom** (`usePresenceRoom`) | Who's connected in the lobby; "host disconnected" banner | Ephemeral, so it doesn't belong in records. |
| **App files** (`useR2Files`, `appFiles`) | Private source upload; public narration MP3s and cover PNGs | Everyone in a game can play the same audio by URL. |
| **Integration: Anthropic** | Quiz generation, personal recaps | The core value. |
| **Integration: ElevenLabs** | Narrated questions | Party/classroom use: the host screen on a TV reads questions aloud. |
| **Integration: Gemini image** | Deck cover art | Makes the library scannable. Best-effort and never blocks play. |
| **Auth** | Sign-in, identity for every action | Built in. |

**Deliberately not used: Stripe/payments.** There are no paying users in an
evaluation build, and a paywall would add a failure path to the core loop without
showing anything about real-time design. The per-user cap on concurrent
generations keeps AI spend bounded instead. Composio/Google were also left out:
there's no user-owned data to pull in.

## Security model

Actions run with record RBAC **off** (that's how the SDK works), so every action
authorizes explicitly:

- **Deck actions** check `createdBy === caller`.
- **Game-control actions** (start, reveal, next, end) check `hostId === caller`.
- **`submitAnswer`** requires a player row, an open question matching the index,
  the server clock within the deadline (+1.5 s grace), and no prior answer.
  `uniqueOn` backs this up.

On the client side (RBAC **on**):

- `questions` (the answer key) is readable by the deck owner only. The live
  question is copied onto the game row **without** its answer. The answer is
  published at reveal, and the full key only when the game finishes.
- `answers` are readable only by their owner, so nobody can copy a pick before
  the reveal. Scores are computed from them **at reveal**, so the scoreboard
  can't leak correctness mid-question either.
- `games` and `players` are read-only to clients.
- No API keys exist in this app. Integrations go through the platform proxy,
  billed to the owner.

## Project layout

```
src/
  schemas/            decks, questions, games, players, answers, recaps (+ RBAC)
  actions/index.ts    all server actions (the game engine)
  server/ai.ts        Anthropic / ElevenLabs / Gemini calls and prompts
  server/generate-deck.ts   the background generation job
  cron.ts, jobs.ts    schedule + job dispatch
  lib/game-logic.ts   pure rules: scoring, codes, quiz validation, ranking
  lib/callAction.ts   action client + server-clock offset for countdowns
  lib/extractText.ts  PDF/DOCX/text extraction in the browser
  components/game/    option tiles, countdown, leaderboard, podium, QR
  pages/              landing, /home, /decks/new, /decks/:id, /play/:code
tests/game.spec.ts    two-user Playwright game (real AI)
```

## Scoring

A correct answer earns 500 + up to 500 for speed (linear over the time limit), plus
a streak bonus of 100 per consecutive correct answer (capped at +300). A wrong
or missing answer scores 0 and resets the streak. Ties share a rank.

## Run, test, deploy

```bash
npm install
npx deepspace auth login
npx deepspace app init        # registers the app and writes DEEPSPACE_APP_ID
npx deepspace dev start       # local dev
npm run test:unit             # 29 unit tests incl. full-game simulation
npx deepspace test run all    # Playwright incl. the two-user game spec
npx deepspace deploy          # → https://<name>.app.space
```

The two-user spec needs two test accounts (`npx deepspace test accounts create …`).

## Known limits / what I'd do next

- **The host drives the clock.** Auto-reveal runs in the host's browser, so if
  the host closes the tab mid-question the game pauses until they return
  (players see a banner). Next step: a delayed job/DO alarm that reveals on the
  server at `questionEndsAt`.
- **One shared RecordRoom.** All games live in the app scope, which is fine for
  study groups. At scale I'd move each game into its own `game:<id>` scope.
- **40 players per game.** Reveal updates every player row in one request, and
  the cap keeps that well inside Workers' subrequest budget. Batching would
  lift it.
- **Scanned PDFs** have no text layer; there's no OCR yet, so users paste text
  instead.
- **Quality control on questions.** The validator drops malformed and duplicate
  items, but the host can't edit a question yet; that would be the next feature.
