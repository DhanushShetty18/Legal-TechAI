/** Single list for the home page, the header, and /game-changers. */
export const GAME_CHANGERS = [
  {
    id: "stamp-duty",
    href: "/stamp-duty",
    title: "Stamp Duty Engine",
    summary: "Work out stamp duty and registration for an Indian state before a deed is filed.",
    needs: "Runs in this website. No API key and no Python backend.",
  },
  {
    id: "e-filing-readiness",
    href: "/game-changers/e-filing-readiness",
    title: "E-Filing Readiness Gate",
    summary: "Tick the papers a filing needs. Missing papers are how a court sends a packet back.",
    needs: "Runs in this website. The lists come from this product's filing checklists.",
  },
  {
    id: "contradiction-finder",
    href: "/game-changers/contradiction-finder",
    title: "Contradiction Finder",
    summary: "Compare two papers for a location, date, or amount that cannot both be true.",
    needs: "Local preview on this page. The full Gemini pipeline stays in the Python backend.",
  },
  {
    id: "form-hydration",
    href: "/game-changers/form-hydration",
    title: "Court Form Hydration",
    summary: "Turn labeled identity lines into the fields a court form is waiting for.",
    needs: "Local preview on this page. Live camera OCR needs the Python backend and a Gemini key.",
  },
] as const;

export type GameChangerId = (typeof GAME_CHANGERS)[number]["id"];
