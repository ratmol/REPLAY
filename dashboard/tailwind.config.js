/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Foundational palette for the "dim editing room" brief. Deliberately
        // just the palette here - scanlines/tracking-wobble/CRT effects are
        // roadmap 2.7's polish pass, not this scaffold.
        surface: {
          DEFAULT: "#0b0c0e", // page background
          raised: "#141518", // cards / panels
          overlay: "#1c1e22", // hover / active surfaces
        },
        ink: {
          DEFAULT: "#e4e2dd", // primary text - warm off-white, never pure #fff
          muted: "#8b8d92", // secondary text
          faint: "#57595e", // tertiary / disabled text
        },
        phosphor: {
          DEFAULT: "#7ee787", // CRT-green accent, used sparingly
          dim: "#3f8a46",
        },
        status: {
          running: "#e3b341", // amber
          completed: "#7ee787", // phosphor green
          failed: "#f85149", // muted red
        },
        border: {
          DEFAULT: "#2a2c31",
        },
      },
      fontFamily: {
        // System stacks only - no webfont network request, consistent with
        // local-first (no external dependency just to render a page).
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
