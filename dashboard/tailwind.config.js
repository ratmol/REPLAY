// Palette constants live outside `theme` so the edge-fade gradients below can
// be built from the exact same values the colour tokens use. Before this, two
// components hardcoded the ground colour as a raw hex inside an arbitrary
// Tailwind value, which meant a palette change silently left two gradients
// pointing at the old scheme.
const SURFACE_DEEP = "#0c0a07";
const SURFACE = "#15110c";
const STEEL_DIM = "#39414b";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // A real flight recorder is not black - it is painted international
        // orange so a search crew can find it in wreckage. That is where the
        // accent comes from, and it is why the ground is a warm charcoal
        // rather than a neutral one: the whole page is lit by that orange.
        surface: {
          deep: SURFACE_DEEP, // full-bleed page ground
          DEFAULT: SURFACE, // panels sitting on the ground
          raised: "#171412", // cards
          overlay: "#201c19", // hover surfaces
        },
        ink: {
          // Every step of this ramp clears 4.5:1 on `surface.deep`. The
          // previous ramp did not - its tertiary grey measured around 2.5:1,
          // which is what made the micro-labels look considered and read as
          // unreadable at the same time.
          DEFAULT: "#f0ebe4", // primary - warm off-white, never pure #fff
          muted: "#b3aca4", // secondary, ~8:1
          faint: "#8b827a", // tertiary / micro-labels, ~4.6:1
        },
        signal: {
          // The hot accent. Interactive, brand, and playhead only - never a
          // status, so it can never be confused with a run outcome.
          DEFAULT: "#ff6b35",
          dim: "#b8461f",
        },
        brass: {
          // The second, quiet warm tone - a desaturated gold for engraved
          // labels, eyebrows, and section markers. This is the answer to
          // "the type is only two colours": it sits between the off-white
          // ink and the hot signal, warm enough to belong to the same lamp
          // family without competing with the accent for attention. Muted on
          // purpose - a vibrant gold would read as a second CTA.
          DEFAULT: "#c6a06a",
          dim: "#8a6f47",
        },
        status: {
          // Three distinct hues, none of them the accent: an amber that reads
          // "in progress", a cool teal that reads "settled", and a crimson
          // pushed off orange far enough that failed and accent are never
          // mistaken for each other at a glance.
          running: "#e0a32c",
          completed: "#4fb8a8",
          failed: "#e8556a",
        },
        steel: {
          // The second temperature, and the reason this stops reading as
          // "dark page, one accent colour". Every structural mark that is not
          // content - bezels, grid lines, rules, axis ticks, disabled chrome -
          // is cool grey-blue, so the warm hues are reserved for things that
          // carry meaning. A single-temperature dark theme is the tell; real
          // instrument panels are cold metal with warm lamps on them.
          DEFAULT: "#7c8896", // ~4.9:1, usable for secondary text
          dim: STEEL_DIM,
          deep: "#20262d",
        },
        glass: {
          // The glass of a lit display: near-black with a cold cast, so an
          // amber or teal number sitting on it looks emitted rather than
          // printed.
          //
          // Named `glass` and not `readout` even though that is what it is
          // for: a colour called readout generates `text-readout`, which
          // collides with the fontSize of the same name and silently wins.
          // That shipped for one build as near-black text on a near-black
          // panel - the readouts were there and simply invisible.
          DEFAULT: "#070a0b",
          edge: "#161b1f",
        },
        border: {
          DEFAULT: "#2b2724",
          bright: "#3e3934",
        },
      },
      boxShadow: {
        // Light comes from above, once, consistently. The inset hairline is
        // the whole trick: a 1px top highlight turns a flat rectangle into a
        // machined face without a gradient, a blur, or a glass effect.
        panel: `inset 0 1px 0 0 rgba(255, 255, 255, 0.045), 0 1px 2px 0 rgba(0, 0, 0, 0.6)`,
        glass: `inset 0 1px 3px 0 rgba(0, 0, 0, 0.9), inset 0 0 0 1px ${STEEL_DIM}`,
        // Used only on the element a keyboard user is actually on.
        focus: `0 0 0 1px #ff6b35, 0 0 0 4px rgba(255, 107, 53, 0.18)`,
      },
      backgroundImage: {
        // Fine engineering graticule for panel interiors. Two 1px lines at 32px
        // pitch - present enough that a panel reads as a measured surface,
        // faint enough that it never competes with the data drawn on it.
        graticule: `linear-gradient(${STEEL_DIM}16 1px, transparent 1px), linear-gradient(90deg, ${STEEL_DIM}16 1px, transparent 1px)`,
        // Horizontal edge-feathers for the tape and the event ticker: content
        // dissolves into the ground instead of being cut off against a hard
        // border.
        "fade-x-deep": `linear-gradient(to right, ${SURFACE_DEEP}, transparent 12%, transparent 88%, ${SURFACE_DEEP})`,
        "fade-x-surface": `linear-gradient(to right, ${SURFACE}, transparent 18%, transparent 82%, ${SURFACE})`,
      },
      backgroundSize: {
        // Named differently from the backgroundImage key on purpose: Tailwind
        // generates `bg-graticule` for both scales, and one silently shadows
        // the other.
        "grid-32": "32px 32px",
      },
      fontSize: {
        // Fluid display scale. The brief is oversized type, and clamp() means
        // the hero headline is genuinely huge on a laptop and still fits a
        // 360px phone without a media query per breakpoint.
        display: ["clamp(2.5rem, 8vw, 6.25rem)", { lineHeight: "0.92", letterSpacing: "-0.04em" }],
        headline: [
          "clamp(1.75rem, 4.5vw, 3.25rem)",
          { lineHeight: "1.02", letterSpacing: "-0.03em" },
        ],
        // Engraved panel labels. Small, wide, and uppercase is how a physical
        // instrument names a dial, and it is the one place tiny type is
        // correct rather than lazy.
        micro: ["0.6875rem", { lineHeight: "1.1", letterSpacing: "0.18em" }],
        // Lit numeric displays. Deliberately larger than body copy - on a real
        // panel the number is the thing you read from across the cockpit.
        readout: ["1.375rem", { lineHeight: "1", letterSpacing: "0.01em" }],
        "readout-lg": ["2.75rem", { lineHeight: "1", letterSpacing: "-0.01em" }],
      },
      fontFamily: {
        // System stacks only - no webfont network request, consistent with
        // local-first (no external dependency just to render a page).
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      keyframes: {
        // A quiet pulse for loading states - deliberately not a spinner,
        // which would read as busy/urgent rather than calm.
        "loading-pulse": {
          "0%, 100%": { opacity: "0.25" },
          "50%": { opacity: "1" },
        },
        // Tape-ticker. Translating -50% of a doubled track is what makes the
        // loop seamless without measuring anything in JS.
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "loading-pulse": "loading-pulse 1.2s ease-in-out infinite",
        marquee: "marquee 38s linear infinite",
      },
    },
  },
  plugins: [],
};
