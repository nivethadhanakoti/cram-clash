/**
 * Landing page — static and prerendered (no auth call, no WebSocket).
 * Keep it renderable without a browser: no window/Date/random during render.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { BrandMark } from '../components/Navigation'
import { OptionShape } from '../components/game/GameUI'
import { seo } from '../seo'

const STEPS = [
  {
    title: 'Drop in your notes',
    body: 'Upload a PDF, Word doc or text file — or paste them. Claude writes a quiz that only asks what your notes actually cover.',
  },
  {
    title: 'Share a 6-letter code',
    body: 'Friends join from any phone or laptop. Questions are read aloud, answers lock in live, and the scoreboard moves in real time.',
  },
  {
    title: 'Learn from what you missed',
    body: 'When the game ends, everyone gets a private AI recap built from the exact questions they got wrong.',
  },
]

const DEMO = ['Mitochondria', 'Ribosome', 'Golgi body', 'Nucleus']

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-grain">
        <header className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-5 font-display text-lg font-extrabold">
          <BrandMark />
          CramClash
          <span className="flex-1" />
          <Link to="/home" className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </header>

        <main className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-8 grid-cols-1 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <section className="animate-rise">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Study group game night
            </p>
            <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
              Turn tonight’s notes into a{' '}
              <mark className="rounded-xl bg-primary px-2 text-foreground [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">live quiz battle</mark>.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              CramClash reads your study material, writes the questions, and runs a real-time
              game for your whole study group — then tells each player exactly what to review.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/decks/new"
                className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:brightness-110"
              >
                Make a quiz from my notes
              </Link>
              <Link
                to="/home"
                className="rounded-full border border-border bg-card px-6 py-3 font-semibold transition hover:bg-secondary"
              >
                I have a join code
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-2 text-sm text-muted-foreground" aria-label="Highlights">
              {['PDF, Word or pasted notes', 'Questions read aloud', 'Study kit + AI recap'].map((t, i) => (
                <li key={t} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1 shadow-[var(--shadow-card)]">
                  <OptionShape index={i} className={`h-3 w-3 ${['text-opt-0', 'text-opt-1', 'text-opt-2'][i]}`} />
                  {t}
                </li>
              ))}
            </ul>
          </section>

          <div className="relative">
            <OptionShape index={0} className="absolute -left-5 -top-6 hidden h-10 w-10 -rotate-12 text-opt-0 sm:block" />
            <OptionShape index={1} className="absolute -right-4 top-10 hidden h-8 w-8 text-opt-1 sm:block" />
            <OptionShape index={2} className="absolute -bottom-5 left-10 hidden h-9 w-9 text-opt-2 sm:block" />
            <OptionShape index={3} className="absolute -bottom-3 -right-3 hidden h-7 w-7 rotate-12 text-opt-3 sm:block" />
          <section aria-label="Example question" className="relative animate-rise rounded-3xl border border-border bg-card p-5 shadow-[0_30px_60px_-30px_rgba(40,25,0,0.35)] transition-transform duration-500 [animation-delay:150ms] hover:rotate-0 sm:p-7 lg:-rotate-2">
            <div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <span>Question 3 of 10</span>
              <span className="font-mono text-base text-foreground">12</span>
            </div>
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-3/5 rounded-full bg-primary" />
            </div>
            <p className="mb-5 font-display text-2xl font-bold leading-snug">
              Which organelle produces most of the cell’s ATP?
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {DEMO.map((text, i) => (
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
          </section>
          </div>
        </main>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                <span className="flex items-center gap-2">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${['bg-opt-0/20', 'bg-opt-1/20', 'bg-opt-3/20'][i]}`}>
                    <OptionShape index={[0, 1, 3][i]} className={`h-4 w-4 ${['text-opt-0', 'text-opt-1', 'text-opt-3'][i]}`} />
                  </span>
                  <span className="font-mono text-sm font-bold text-muted-foreground">0{i + 1}</span>
                </span>
                <h2 className="mt-2 font-display text-xl font-bold">{s.title}</h2>
                <p className="mt-2 text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
