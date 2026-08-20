// Palette constants live outside `theme` so the edge-fade gradients below can
// be built from the exact same values the colour tokens use. Before this, two
// components hardcoded the ground colour as a raw hex inside an arbitrary
// Tailwind value, which meant a palette change silently left two gradients
// pointing at the old scheme.
const SURFACE_DEEP = "#0a0908";
const SURFACE = "#100e0d";

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
          // The one accent. Interactive, brand, and playhead only - never a
          // status, so it can never be confused with a run outcome.
          DEFAULT: "#ff6b35",
          dim: "#b8461f",
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
        border: {
          DEFAULT: "#2b2724",
          bright: "#3e3934",
        },
      },
      backgroundImage: {
        // Horizontal edge-feathers for the tape and the event ticker: content
        // dissolves into the ground instead of being cut off against a hard
        // border.
        "fade-x-deep": `linear-gradient(to right, ${SURFACE_DEEP}, transparent 12%, transparent 88%, ${SURFACE_DEEP})`,
        "fade-x-surface": `linear-gradient(to right, ${SURFACE}, transparent 18%, transparent 82%, ${SURFACE})`,
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
        micro: ["0.625rem", { lineHeight: "1.1", letterSpacing: "0.18em" }],
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
