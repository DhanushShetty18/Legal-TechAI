# E-filing updated (Cursor)

This folder is its own website. It calculates Indian stamp duty, and it has four Game changer modules. It does not change the old website files.

Why the pieces are shaped this way is in `DECISIONS.md`. How to put this folder on the live Vercel project is in `DEPLOY.md`.

You can follow this page even if you are new to the project. The file names are here so an engineer can find the exact piece that broke.

## How to run

Open a terminal in this folder (`E-filing updated-Cursor`).

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Checks the stamp duty maths, the contradiction preview, and the form filler. No browser needed. |
| `npm run build` | Builds the site the way Vercel will. |
| `npm start` | Serves that build. Run `npm run build` first. |
| `npm run lint` | Checks the code style. |

You do not need a `.env` file. You do not need the Python backend. You do not need a Gemini key. Stamp duty does not call those.

## The map: what connects to what

```
Browser page
    |
    |  click Calculate
    v
/api/stamp-duty          src/app/api/stamp-duty/route.ts
    |
    |  hands the form fields over
    v
calculateStampDuty       src/lib/stamp-duty/engine.ts
    |
    |  looks up percentages in the same file
    v
STATE_RATES              src/lib/stamp-duty/engine.ts
                         (src/lib/stamp-duty/rates.ts re-exports them for the pages)
```

The home page and the Game changers page both read one list: `src/lib/game-changers.ts`. If you add a module, add it there. The cards and the routes stay in step.

The header (`src/components/SiteHeader.tsx`) links to Home (the logo), Stamp Duty, and Game changers.

## Stamp duty: what fires when

1. **You type a value, or you change a dropdown.** Only the box on the page changes. Nothing is sent. The rate chips for the selected state update immediately, because those percentages are already in the browser (`rates.ts`). The rupee total does not move yet.
2. **You click Calculate stamp duty.** `StampDutyCalculator` sends a POST to `/api/stamp-duty` with `state`, `propertyValue`, `gender`, `propertyType`, and `transactionType`.
3. **The route reads the JSON.** If the body is not JSON, it stops. If it is JSON, it calls `calculateStampDuty`.
4. **The engine does the maths.** It checks the fields, picks the state rate, then applies the rules in this order:
   - start with the male, female, or joint percentage
   - commercial or industrial property: add 1 point
   - gift deed: subtract 2 points, but never go below 1%
   - lease or will: the rate becomes 1%, and this step wins over the ones above
   - stamp duty = value × rate, rounded to the nearest rupee
   - registration = value × that state's registration percentage, rounded
   - total = stamp duty + registration
5. **The page shows the result.** If you edit the form after that, the old total stays, with a warning to click Calculate again.

Worked example: Maharashtra, male buyer, residential sale, value `5000000`.

- stamp duty 6% = ₹3,00,000
- registration 1% = ₹50,000
- total = ₹3,50,000

`50,00,000` with commas is the same number. The engine strips the commas.

## Where the rates came from

The working rules were already on the main site, in `frontend/src/app/stamp-duty/page.tsx`. That page did the maths inside the button handler.

The folder `stamp-duty-engine/` at the repo root is empty. There was no separate engine to import.

This app copies that rate table and those rules into `src/lib/stamp-duty/`. The original page is not edited. One difference: the old page did nothing when the value was blank or not a number. This app shows an error instead. The old internal key `gujart` is spelled `gujarat` here. The label and the 4.9% rate are unchanged.

The live Vercel app is built from `e-filing-updated/frontend`. That copy never received the stamp duty page. This folder is how that calculator becomes a site you can deploy on its own. See `DEPLOY.md`.

## Game changer modules

The old home page had a block called Investor Showcase (Inconsistency Detector, Legal Q&A, API Explorer, Judge Dashboard). This website does not use that block. The home page says **Game changer modules** and links to:

| Module | Address | What the click does |
| --- | --- | --- |
| Stamp Duty Engine | `/stamp-duty` | POST `/api/stamp-duty`, then show rupees or an error |
| E-Filing Readiness Gate | `/game-changers/e-filing-readiness` | Looks at the ticked papers in the browser. No server call |
| Contradiction Finder | `/game-changers/contradiction-finder` | Compares Location, Date, and Amount lines in the browser |
| Court Form Hydration | `/game-changers/form-hydration` | Copies labeled lines into form fields in the browser |

The readiness lists come from work this product already does: stamp duty before a sale deed, the divorce paper phases on the file-a-case screen, and the FIR versus witness papers the inconsistency engine compares.

The contradiction page and the form page are previews. The full inconsistency pipeline is `backend/modules/inconsistency/`. The full photo-to-form OCR is `backend/modules/ocr_extractor.py`. Those need the Python server and `GEMINI_API_KEY`. This website does not start them. If they are missing, stamp duty still works. The preview pages still work. Only the live AI versions are absent.

On those two pages, typing only fills the box. **Check for clashes** and **Fill the form** are the clicks that run the code. **Load FIR example** and **Load example** only paste sample text. They do not run the check.

## What breaks

| What is missing or wrong | What you see |
| --- | --- |
| Blank property value, `0`, a negative number, or words like `50 lakh` | A red message. No total. |
| A state, buyer, property, or document type the table does not know | A red message from the engine. The dropdowns only offer known values, so this shows up if something else calls the API. |
| `/api/stamp-duty` is missing, or the dev server is stopped | "The stamp duty route did not answer." |
| You open `/api/stamp-duty` in the address bar (that is a GET) | No calculation. The form uses POST. |
| A `.env` file or Gemini key is missing | Stamp duty still works. The Python AI features are simply not in this folder. |
| You open `/inconsistency`, `/legal-qa`, `/api-explorer`, or `/judge-dashboard` | Those Investor Showcase routes are not pages here. You get "This page is not in the e-filing app." |
| You open a made-up address | Same not-found page, with links home and to Game changers. |
| `npm install` was not run | `npm run dev` fails because `next` is not installed. |
| Root Directory on Vercel is still the repo root | The live URL keeps serving `e-filing-updated/frontend`, which has no stamp duty page. `DEPLOY.md` is the switch. |
