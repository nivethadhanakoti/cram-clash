/**
 * Landing page — static and prerendered (no auth call, no WebSocket).
 * Keep it renderable without a browser: no window/Date/random during render.
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, FileText, Headphones, Sparkles, Ticket, Trophy, Users } from 'lucide-react'
import { Seo } from '../components/Seo'
import { BrandMark } from '../components/Navigation'
import { OptionShape } from '../components/game/GameUI'
import { seo } from '../seo'
import { CODE_LENGTH, normalizeCode } from '../lib/game-logic'

/** Example subjects shown as illustrated cards in the hero. Decorative. */
const SUBJECTS = [
  { subject: 'Biology', topic: 'Cell respiration', shape: 0, tint: 'from-[#ff8a72] to-[#ff5a4a]' },
  { subject: 'History', topic: 'The Cold War', shape: 3, tint: 'from-[#a497ff] to-[#7a66ff]' },
  { subject: 'Economics', topic: 'Price elasticity', shape: 1, tint: 'from-[#4fd8c6] to-[#14a898]' },
  { subject: 'Computer science', topic: 'Big-O notation', shape: 2, tint: 'from-[#ffc65a] to-[#ff9f1a]' },
]

const STEPS = [
  {
    icon: FileText,
    title: 'Drop in your notes',
    body: 'PDF, Word, text or paste. Claude writes questions only from what your notes actually cover.',
  },
  {
    icon: Users,
    title: 'Share a 6-letter code',
    body: 'Friends join from any phone. Questions are read aloud, answers lock in live, scores move every round.',
  },
  {
    icon: Sparkles,
    title: 'Learn what you missed',
    body: 'Everyone gets a study kit and a private AI recap that links each miss to the concept to review.',
  },
]

const FEATURES = [
  { icon: Headphones, label: 'Narrated questions' },
  { icon: Trophy, label: 'Live leaderboard' },
  { icon: Sparkles, label: 'Study kit + AI recap' },
]

function SubjectCard({ s, i }: { s: (typeof SUBJECTS)[number]; i: number }) {
  return (
    <Link
      to="/decks/new"
      className={`group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-3xl bg-gradient-to-br ${s.tint} p-4 text-white shadow-[0_24px_50px_-28px_rgba(20,10,0,0.6)] ring-1 ring-white/25 transition duration-300 hover:-translate-y-1 animate-rise`}
      style={{ animationDelay: `${200 + i * 90}ms` }}
    >
      {/* Illustration: one big answer shape plus a scatter of small ones */}
      <OptionShape index={s.shape} className="absolute -right-6 -top-6 h-36 w-36 rotate-12 text-white/25 transition duration-500 group-hover:rotate-0" />
      <OptionShape index={(s.shape + 1) % 4} className="absolute left-5 top-6 h-7 w-7 text-white/40" />
      <OptionShape index={(s.shape + 2) % 4} className="absolute left-16 top-16 h-4 w-4 text-white/35" />
      <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/35 to-transparent" />
      <span className="relative text-xs font-semibold uppercase tracking-widest text-white/85">{s.subject}</span>
      <span className="relative font-display text-xl font-extrabold leading-tight">{s.topic}</span>
    </Link>
  )
}

/**
 * "Got a code?" — sends players straight to /play/CODE. The game page
 * handles sign-in and joins them automatically, so this needs no server
 * call here (the landing page stays static and prerendered).
 */
function JoinCode() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const ready = code.length === CODE_LENGTH
  function submit(e: FormEvent) {
    e.preventDefault()
    if (ready) navigate(`/play/${code}`)
  }
  return (
    <form
      id="join"
      onSubmit={submit}
      data-testid="landing-join"
      className="mt-3 flex max-w-xl items-center gap-2 rounded-full border border-white/15 bg-white/10 p-1.5 pl-4 backdrop-blur focus-within:border-white/40"
    >
      <Ticket className="h-4 w-4 shrink-0 text-[#ffc23d]" />
      <span className="hidden shrink-0 text-sm font-semibold text-white/80 sm:inline">Got a code?</span>
      <input
        value={code}
        onChange={(e) => setCode(normalizeCode(e.target.value))}
        placeholder="ABC123"
        aria-label="Game code"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        className="h-10 w-full min-w-0 flex-1 bg-transparent font-mono text-lg font-bold uppercase tracking-[0.25em] text-white outline-none placeholder:text-white/30"
      />
      <button
        type="submit"
        disabled={!ready}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#ff6b57] px-4 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-40 sm:px-5"
      >
        Join game <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  )
}

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-grain pb-16">
        <header className="mx-auto flex max-w-7xl items-center gap-2 px-5 py-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight">
            <BrandMark className="h-7 w-7" />
            CramClash
          </Link>
          <span className="flex-1" />
          <a href="#join" className="hidden whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground sm:inline-flex">
            I have a code
          </a>
          <Link to="/home" className="whitespace-nowrap rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90">
            Sign in
          </Link>
        </header>

        {/* ── Hero panel ───────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-3 sm:px-6">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#1c1828] px-6 pb-28 pt-10 text-white shadow-[0_40px_80px_-40px_rgba(28,24,40,0.7)] sm:px-10 sm:pt-14 lg:px-14 lg:pb-32">
            {/* Background art: soft color glows + oversized answer shapes */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#ffc23d]/30 blur-3xl" />
              <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-[#8c7bff]/30 blur-3xl" />
              <div className="absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-[#22c3b0]/25 blur-3xl" />
              <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1.3px)] [background-size:22px_22px]" />
              <OptionShape index={0} className="absolute -left-10 bottom-10 h-48 w-48 -rotate-12 text-white/[0.04]" />
              <OptionShape index={2} className="absolute left-[42%] top-6 h-24 w-24 text-white/[0.05]" />
            </div>

            <div className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
              <div className="animate-rise">
                <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/85 backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ffc23d]" /> Study group game night
                </p>
                <h1 className="font-display text-[2.6rem] font-extrabold leading-[0.98] tracking-tight min-[400px]:text-5xl sm:text-6xl lg:text-7xl">
                  Turn tonight’s notes into a{' '}
                  <span className="bg-gradient-to-r from-[#ffd166] via-[#ffb020] to-[#ff7a59] bg-clip-text text-transparent">live quiz battle.</span>
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">
                  CramClash reads your study material, writes the questions, runs a real-time game for your whole group — then
                  shows each player exactly what to review.
                </p>

                {/* Faux input, Hive-style: a big pill that leads into creation */}
                <Link
                  to="/decks/new"
                  className="group mt-8 flex max-w-xl items-center gap-3 rounded-full bg-white p-2 pl-5 text-left shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)] ring-1 ring-black/5 transition hover:ring-4 hover:ring-[#ffc23d]/50"
                >
                  <FileText className="hidden h-5 w-5 shrink-0 text-[#9a5f00] sm:block" />
                  <span className="min-w-0 flex-1 truncate text-base text-[#6b6480]"><span className="sm:hidden">Paste notes or a PDF…</span><span className="hidden sm:inline">Drop a lecture PDF or paste your notes…</span></span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#ffc23d] px-4 py-2.5 text-sm font-bold text-[#241a02] transition group-hover:brightness-105 sm:px-5">
                    Make my quiz <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>

                <JoinCode />

                <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/75" aria-label="Highlights">
                  {FEATURES.map((f) => (
                    <li key={f.label} className="inline-flex items-center gap-1.5">
                      <f.icon className="h-4 w-4 text-[#ffc23d]" /> {f.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4" aria-label="Works for any subject">
                {SUBJECTS.map((s, i) => (
                  <SubjectCard key={s.subject} s={s} i={i} />
                ))}
              </div>
            </div>
          </div>

          {/* ── Steps card overlapping the hero ─────────────────────────── */}
          <div className="relative z-10 mx-auto -mt-16 max-w-6xl px-2 sm:-mt-20 sm:px-6">
            <ol className="grid grid-cols-1 gap-3 rounded-[1.75rem] border border-border bg-card p-3 shadow-[0_30px_60px_-30px_rgba(40,25,0,0.35)] md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl bg-secondary/60 p-5">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ffc23d] font-mono text-sm font-bold text-[#241a02]">
                      {i + 1}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{s.title}</span>
                  </div>
                  <p className="text-[15px] leading-relaxed text-foreground/85">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Live game preview ───────────────────────────────────────── */}
        <section className="mx-auto mt-16 grid max-w-6xl grid-cols-1 items-center gap-10 px-5 sm:px-8 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">What players see</p>
            <h2 className="mt-2 font-display text-4xl font-extrabold leading-tight tracking-tight">
              Every answer locks in live.
            </h2>
            <p className="mt-4 max-w-md text-lg text-muted-foreground">
              The host’s screen is the stage; every phone is a buzzer. Faster right answers score more, streaks add a bonus,
              and the leaderboard reshuffles after every reveal.
            </p>
            <Link
              to="/decks/new"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 font-semibold text-background transition hover:opacity-90"
            >
              Host a game <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="relative">
            <OptionShape index={0} className="absolute -left-4 -top-5 hidden h-10 w-10 -rotate-12 text-opt-0 sm:block" />
            <OptionShape index={3} className="absolute -bottom-4 -right-3 hidden h-8 w-8 rotate-12 text-opt-3 sm:block" />
            <div aria-label="Example question" className="relative rounded-3xl border border-border bg-card p-5 shadow-[0_30px_60px_-30px_rgba(40,25,0,0.35)] sm:p-7 lg:rotate-1">
              <div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <span>Question 3 of 10</span>
                <span className="font-mono text-base text-foreground">12</span>
              </div>
              <div className="mb-5 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-3/5 rounded-full bg-primary" />
              </div>
              <p className="mb-5 font-display text-2xl font-bold leading-snug">Which organelle produces most of the cell’s ATP?</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {['Mitochondria', 'Ribosome', 'Golgi body', 'Nucleus'].map((text, i) => (
                  <div
                    key={text}
                    className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 font-semibold text-[#160f02] ${['bg-opt-0', 'bg-opt-1', 'bg-opt-2', 'bg-opt-3'][i]}`}
                  >
                    <OptionShape index={i} className="text-[#160f02]/80" />
                    {text}
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">4 of 6</span> players locked in
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
