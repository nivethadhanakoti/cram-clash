/**
 * Concept map rendered with Mermaid (lazy-loaded; ~1 MB that only loads
 * when a kit is opened). Model text only ever reaches Mermaid as quoted,
 * escaped labels (see buildMermaid) and Mermaid runs with
 * securityLevel 'strict', so the SVG can't carry scripts or click handlers.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { buildMermaid, type StudyKit } from "@/lib/kit-logic";

let mermaidReady: Promise<typeof import('mermaid').default> | null = null

/** Read a theme color from CSS so the map matches whichever theme is active. */
function themeColor(name: string, fallback: string) {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function loadMermaid() {
  mermaidReady ??= import('mermaid').then(({ default: mermaid }) => {
    const dark = document.documentElement.style.colorScheme === 'dark' ||
      getComputedStyle(document.documentElement).colorScheme === 'dark'
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: "'Bricolage Grotesque Variable', -apple-system, sans-serif",
      themeVariables: {
        darkMode: dark,
        background: themeColor('--color-card', '#ffffff'),
        primaryColor: themeColor('--color-secondary', '#f3ecdf'),
        primaryTextColor: themeColor('--color-foreground', '#1c1828'),
        primaryBorderColor: themeColor('--color-ring', '#e0a100'),
        lineColor: themeColor('--color-muted-foreground', '#5f586f'),
        secondaryColor: themeColor('--color-muted', '#f1eadc'),
        tertiaryColor: themeColor('--color-card', '#ffffff'),
        edgeLabelBackground: themeColor('--color-card', '#ffffff'),
        fontSize: '15px',
      },
      flowchart: { curve: 'basis', padding: 14, nodeSpacing: 36, rankSpacing: 48, useMaxWidth: false },
    })
    return mermaid
  })
  return mermaidReady
}

export function ConceptMap({ map }: { map: StudyKit["conceptMap"] }) {
  const rawId = useId();
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // On narrow screens the map keeps its natural size and scrolls sideways
  // inside its box; say so only when that's actually happening.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !svg) return;
    const check = () => setScrollable(el.scrollWidth > el.clientWidth + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [svg]);

  useEffect(() => {
    let alive = true;
    // Top-down keeps labels at full size; a wide left-right chain would be
    // scaled down until unreadable.
    const source = buildMermaid(map, "TD");
    if (!source) return;
    loadMermaid()
      .then((mermaid) =>
        mermaid.render(`cmap-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`, source),
      )
      .then(({ svg: out }) => alive && setSvg(out))
      .catch((err) => {
        console.warn("[concept map] render failed", err);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [map, rawId]);

  if (!map.nodes.length) return null;

  if (failed) {
    // Fallback: the same relationships as a readable list.
    const label = new Map(map.nodes.map((n) => [n.id, n.label]));
    return (
      <ul className="space-y-1.5 text-sm" data-testid="concept-map-fallback">
        {map.edges.map((e, i) => (
          <li key={i}>
            <span className="font-semibold">{label.get(e.from)}</span>
            <span className="text-muted-foreground">
              {" "}
              {e.label ? `— ${e.label} →` : "→"}{" "}
            </span>
            <span className="font-semibold">{label.get(e.to)}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (!svg) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  return (
    <>
      {scrollable && (
        <p className="mb-2 text-xs text-muted-foreground">
          Swipe sideways to see the whole map →
        </p>
      )}
      <div
        ref={boxRef}
        className="concept-map overflow-x-auto pb-2 [&_svg]:mx-auto [&_svg]:h-auto"
        data-testid="concept-map"
        // Mermaid output in strict mode, from escaped labels only.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </>
  );
}
