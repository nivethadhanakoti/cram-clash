import { useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useR2Files } from "deepspace";
import { FileText, Loader2, Sparkles, Upload, X } from "lucide-react";
import { Button, Switch, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { callAction } from "@/lib/callAction";
import { ACCEPTED_FILES, extractText } from "@/lib/extractText";
import {
  MAX_QUESTIONS,
  MAX_SOURCE_CHARS,
  MIN_QUESTIONS,
  MIN_SOURCE_CHARS,
  type Difficulty,
} from "@/lib/game-logic";
import { OptionShape } from "@/components/game/GameUI";

const DIFFICULTIES: Array<{ id: Difficulty; label: string; hint: string }> = [
  { id: "easy", label: "Warm-up", hint: "Key terms and facts" },
  { id: "medium", label: "Standard", hint: "Recall + understanding" },
  { id: "hard", label: "Exam mode", hint: "Application & traps" },
];

export default function NewDeckPage() {
  const navigate = useNavigate();
  const { error } = useToast();
  // Originals go to the uploader's private storage; only extracted text is sent for generation.
  const { upload } = useR2Files();
  const inputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [narrate, setNarrate] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function takeFile(f: File) {
    if (f.size > 20 * 1024 * 1024) return error("That file is over 20 MB");
    setReading(true);
    try {
      const extracted = await extractText(f);
      setFile(f);
      setText(extracted.slice(0, MAX_SOURCE_CHARS));
      if (!title)
        setTitle(
          f.name
            .replace(/\.[^.]+$/, "")
            .replace(/[_-]+/g, " ")
            .slice(0, 120),
        );
    } catch (err) {
      error(
        "Couldn’t read that file",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setReading(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void takeFile(f);
  }

  async function submit() {
    setSubmitting(true);
    let sourceKey = "";
    if (file) {
      // Keeping the original is a convenience; generation never depends on it.
      try {
        const res = await upload(file, file.name);
        if (res.success && res.key) sourceKey = res.key;
      } catch {
        /* non-fatal */
      }
    }
    const res = await callAction<{ deckId: string }>("createDeck", {
      title,
      sourceName: file?.name ?? "Pasted notes",
      sourceKey,
      sourceText: text,
      questionCount: count,
      difficulty,
      narrate,
    });
    setSubmitting(false);
    if (!res.success) return error("Couldn’t start generating", res.error);
    navigate(`/decks/${res.data.deckId}`);
  }

  const chars = text.trim().length;
  const tooShort = chars < MIN_SOURCE_CHARS;
  const truncated = chars >= MAX_SOURCE_CHARS;

  return (
    <div className="min-h-full bg-grain">
      <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
        <header className="relative overflow-hidden rounded-[2rem] bg-[#1c1828] px-6 pb-24 pt-10 text-white shadow-[0_40px_80px_-40px_rgba(28,24,40,0.7)] sm:px-10 sm:pb-28 sm:pt-12">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 -top-20 h-56 w-56 rounded-full bg-[#ffc23d]/25 blur-3xl" />
            <div className="absolute -right-10 -bottom-24 h-64 w-64 rounded-full bg-[#8c7bff]/30 blur-3xl" />
            <OptionShape
              index={0}
              className="absolute right-6 top-6 h-14 w-14 rotate-12 text-white/10"
            />
            <OptionShape
              index={1}
              className="absolute bottom-5 right-24 h-8 w-8 text-white/10"
            />
          </div>
          <p className="relative text-xs font-bold uppercase tracking-widest text-[#ffc23d]">
            New quiz
          </p>
          <h1 className="relative mt-2 font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Turn your notes
            <br className="hidden sm:block" /> into a game.
          </h1>
          <p className="relative mt-4 max-w-xl text-lg text-white/75">
            Questions come only from what you provide, so better notes make a
            better game. You’ll also get a study kit.
          </p>
        </header>

        <div className="relative z-10 mx-auto -mt-16 max-w-5xl rounded-[1.75rem] border border-border bg-card p-3 shadow-[0_30px_60px_-30px_rgba(40,25,0,0.35)] sm:-mt-20 sm:p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.25fr_1fr]">
            <section className="space-y-5 rounded-2xl bg-secondary/60 p-5">
              <StepTitle n={1} title="Your notes" />
              <div>
                <label
                  htmlFor="deck-title"
                  className="mb-1.5 block text-sm font-semibold"
                >
                  Name{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional — we’ll suggest one)
                  </span>
                </label>
                <input
                  id="deck-title"
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="BIO 201 — Week 4: Cell respiration"
                  className="h-12 w-full rounded-xl border border-input bg-card px-4 outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "rounded-2xl border-2 border-dashed p-5 transition",
                  dragging ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                {file ? (
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {chars.toLocaleString()} characters extracted
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove file"
                      onClick={() => {
                        setFile(null);
                        setText("");
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-2 py-4 text-center"
                    disabled={reading}
                  >
                    {reading ? (
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    ) : (
                      <Upload className="h-8 w-8 text-primary" />
                    )}
                    <span className="font-semibold">
                      {reading
                        ? "Reading your file…"
                        : "Drop a PDF, Word doc or text file"}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      or click to browse · up to 20 MB
                    </span>
                  </button>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED_FILES}
                  className="hidden"
                  data-testid="notes-file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void takeFile(f);
                    e.target.value = "";
                  }}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor="notes" className="text-sm font-semibold">
                    {file
                      ? "Extracted text (edit if needed)"
                      : "Or paste your notes"}
                  </label>
                  <span
                    className={cn(
                      "font-mono text-xs",
                      tooShort ? "text-muted-foreground" : "text-success",
                    )}
                  >
                    {chars.toLocaleString()} /{" "}
                    {MAX_SOURCE_CHARS.toLocaleString()}
                  </span>
                </div>
                <textarea
                  id="notes"
                  value={text}
                  onChange={(e) =>
                    setText(e.target.value.slice(0, MAX_SOURCE_CHARS))
                  }
                  rows={9}
                  placeholder="Paste lecture notes, a textbook section, a study guide…"
                  className="w-full resize-y rounded-xl border border-input bg-card px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring"
                />
                {tooShort && chars > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add at least {MIN_SOURCE_CHARS} characters.
                  </p>
                )}
                {truncated && (
                  <p className="mt-1 text-sm text-warning">
                    Long document — only the first{" "}
                    {MAX_SOURCE_CHARS.toLocaleString()} characters are used.
                  </p>
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-3">
              <section className="space-y-6 rounded-2xl bg-secondary/60 p-5">
                <StepTitle n={2} title="Quiz style" />
                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <label htmlFor="count" className="text-sm font-semibold">
                      Questions
                    </label>
                    <span className="font-mono text-lg font-bold">{count}</span>
                  </div>
                  <input
                    id="count"
                    type="range"
                    min={MIN_QUESTIONS}
                    max={MAX_QUESTIONS}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-full accent-[var(--color-primary)]"
                  />
                </div>

                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">
                    Difficulty
                  </legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {DIFFICULTIES.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        aria-pressed={difficulty === d.id}
                        onClick={() => setDifficulty(d.id)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition",
                          difficulty === d.id
                            ? "border-foreground bg-foreground text-background [&_span:last-child]:text-background/70"
                            : "border-border bg-card hover:border-foreground/30",
                        )}
                      >
                        <span className="block font-semibold">{d.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {d.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              </section>
              <section className="space-y-5 rounded-2xl bg-secondary/60 p-5">
                <StepTitle n={3} title="Extras" />
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm font-semibold">
                      Read questions aloud
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      Records a narrator voice for each question — great when
                      the host screen is on a TV.
                    </span>
                  </span>
                  <Switch
                    checked={narrate}
                    onCheckedChange={(v) => setNarrate(Boolean(v))}
                  />
                </label>
                <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Included automatically:
                  </span>{" "}
                  a study kit with a summary, key concepts, a printable cheat
                  sheet and a concept map — shared with players when the game
                  ends.
                </p>
              </section>
            </div>
          </div>

          <div className="mt-3 flex flex-col-reverse items-stretch gap-3 px-2 pb-1 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {count} questions
              </span>{" "}
              · {DIFFICULTIES.find((d) => d.id === difficulty)?.label}
              {narrate ? " · narrated" : ""} · study kit included
            </p>
            <Button
              size="lg"
              className="h-14 rounded-full bg-foreground px-8 text-base font-bold text-background hover:bg-foreground/90"
              disabled={tooShort || submitting || reading}
              onClick={submit}
              data-testid="generate-deck"
            >
              {submitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Generate my quiz
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ffc23d] font-mono text-sm font-bold text-[#241a02]">
        {n}
      </span>
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </span>
    </div>
  );
}
