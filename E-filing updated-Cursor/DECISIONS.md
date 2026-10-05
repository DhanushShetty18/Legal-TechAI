# Decision log

This is the record of the engineering choices for the app in `E-filing updated-Cursor`. Each item says what was chosen, why, what was rejected, and what breaks if you reverse it.

## 1. Put the new app in its own folder

**Chosen:** Every new file lives in the top-level folder `E-filing updated-Cursor`. Nothing outside that folder was edited.

**Why:** The request was to add a usable stamp duty site without rewriting the code that is already live. The live Vercel build is driven by the repo-root `vercel.json`, which runs `e-filing-updated/frontend`. That copy has no stamp duty page.

**Rejected:** Editing `frontend/`, editing `e-filing-updated/`, or changing the repo-root `vercel.json`. Any of those would rewrite the current site’s source.

**If reversed:** The current production source changes. That was the one thing this work was not allowed to do.

## 2. The empty `stamp-duty-engine` folder is not the engine

**Chosen:** Treat `frontend/src/app/stamp-duty/page.tsx` as the engine that already exists. Copy its rate table and its rules into `src/lib/stamp-duty/engine.ts` inside the new folder. Leave the empty folder and the original page untouched.

**Why:** `stamp-duty-engine/` at the repo root exists and contains no files. There is no function there to import. The working maths is inside the button handler on that Next.js page: state percentages, a commercial/industrial uplift, a gift reduction, and a flat 1% for a lease or a will.

**Rejected:** Waiting for the empty folder to grow code, or importing a module that is not there.

**If reversed:** The new app has no rates and Calculate does nothing.

## 3. Why this is a separate website, not a patch on the old one

**Chosen:** A full Next.js app in the new folder, with its own `package.json`, `npm run build`, and `vercel.json`.

**Why:** The site people open today is built from `e-filing-updated/frontend`. The stamp duty page was added later, only under `frontend/`. Pointing Vercel at this new folder is how the same URL can serve the new app without editing the old files. `DEPLOY.md` is the switch.

**Rejected:** Copying only a component into the old frontend. That would edit a folder this work must not touch.

**If reversed:** The live project keeps building the old frontend, and stamp duty stays off https://legal-techai-frontend.vercel.app/.

## 4. How stamp duty is wired

**Chosen:** The page does not do the maths itself.

1. Typing or changing a dropdown only updates the form. The state rate chips change immediately, because those percentages are already in the browser.
2. **Calculate stamp duty** sends POST `/api/stamp-duty` with state, property value, buyer, property type, and document type.
3. `src/app/api/stamp-duty/route.ts` reads the JSON. That is where data enters.
4. `calculateStampDuty` in `src/lib/stamp-duty/engine.ts` checks the fields and does the maths. That is the transform.
5. The page shows rupees, or a red error. That is the next step.

Rule order, same as the original page:

- Start with the male, female, or joint percentage for that state.
- Commercial or industrial property adds 1 point.
- A gift deed subtracts 2 points, and the rate never goes below 1%.
- A lease or a will sets the rate to 1%. This step wins over the ones above.
- Registration is a separate percentage from the same state row. It is not inside the stamp duty rate.

Worked example: Maharashtra, male, residential sale, `5000000` → stamp duty ₹3,00,000, registration ₹50,000, total ₹3,50,000.

**Rejected:** Leaving the formula inside the click handler, the way the original page does. That version cannot be tested without a browser, and a blank box fails in silence.

**If reversed:** Delete the route and the button cannot finish. It shows “The stamp duty route did not answer.” Change the rule order and gift, lease, and commercial totals change.

## 5. Bad input is an error, not a silent return

**Chosen:** A blank value, zero, a negative number, or words such as `50 lakh` return a clear error and no total. Commas in `50,00,000` are allowed.

**Why:** The original page used `parseFloat` and then `return` when the number was missing. The user saw the empty panel and could not tell why.

**Rejected:** Copying that silent return.

**If reversed:** Calculate looks like a broken button again.

## 6. Gujarat’s internal key is spelled correctly

**Chosen:** The state key is `gujarat`. The label stays Gujarat. The rate stays 4.9%, which is the number on the original page.

**Why:** The original key was `gujart`. Users only see the label, but a typo key is a trap for the API.

**Rejected:** Copying the typo so the keys match exactly.

**If reversed:** Nothing on screen changes for a person using the dropdown. An API caller who sends `gujarat` would then be rejected.

## 7. The rate table lives in the engine file

**Chosen:** `STATE_RATES` is declared in `engine.ts`. `rates.ts` re-exports it for the pages. `npm test` loads `engine.ts` with Node.

**Why:** Node’s test runner cannot follow an import like `./rates` with no file extension. Next.js can. Putting the table in the file the tests import avoids a second copy of the numbers.

**Rejected:** A duplicate table in the test, or adding a bundler just to run twelve checks.

**If reversed:** `npm test` fails to load the engine, or the page and the tests drift onto different numbers.

## 8. Investor Showcase is replaced by Game changer modules

**Chosen:** The home page heading is **Game changer modules**. The header links to Stamp Duty and Game changers. The four modules are:

| Module | Address | What it uses |
| --- | --- | --- |
| Stamp Duty Engine | `/stamp-duty` | The engine and `/api/stamp-duty` |
| E-Filing Readiness Gate | `/game-changers/e-filing-readiness` | Checklists already implied by this product: a property sale (duty before the deed), the divorce paper phases from the file-a-case screen, and an FIR / witness packet |
| Contradiction Finder | `/game-changers/contradiction-finder` | A local preview that compares Location, Date, and Amount lines |
| Court Form Hydration | `/game-changers/form-hydration` | A local preview that copies labeled identity lines into form fields |

The old Investor Showcase routes (`/inconsistency`, `/legal-qa`, `/api-explorer`, `/judge-dashboard`) are not pages in this app. Opening one shows “This page is not in the e-filing app.”

**Why:** The request was to replace that block in this new app: navigation, routes, copy, and module pages. There was no Game changer content already in the repo. The new pages describe stamp duty, e-filing, and the legal-tech work this product actually does.

**Rejected:** Renaming the heading and keeping the same four investor pages. Also rejected: generic filler that is not about filings, duty, contradictions, or court forms.

**If reversed:** Investor Showcase becomes the live module again, which this app was built to replace.

## 9. The full AI engines stay in the Python backend

**Chosen:** This website does not call Gemini and does not need a `.env` file. The contradiction page says it only reads three kinds of lines. The form page says it does not use the camera. The real pipelines stay where they are: `backend/modules/inconsistency/` and `backend/modules/ocr_extractor.py`.

**Why:** Those pipelines need the Python server and `GEMINI_API_KEY`. Stamp duty does not. Shipping a calculator that fails without a secret would hide the feature that can run today.

**Rejected:** Proxying the live Render API from the new pages and calling that “done” when the key or the server is down.

**If reversed:** Stamp duty still would not need the key. The preview pages would start failing whenever the Python API is down.

## 10. Production was not switched

**Chosen:** Do not change https://legal-techai-frontend.vercel.app/ from this environment. Deploy an anonymous temporary preview of this folder instead.

**Why:** There is no `VERCEL_TOKEN`, the Vercel CLI is logged out, and GitHub access from this environment cannot read that project’s deployments (HTTP 403). The CLI refused `vercel deploy` until `--temporary` was used. `--temporary` uploads this folder as its own anonymous deployment. It does not log into the account that owns `legal-techai-frontend`, and it does not change that project’s Root Directory.

Checked after the preview existed: the production home page still contains “Investor Showcase” and does not contain “Game changer modules”.

**Rejected:** `vercel deploy --prod` against the existing project. That needs the owner’s token, and a logged-out temporary deploy must not be aimed at their production domain. Also rejected: editing the repo-root `vercel.json` so the next git deploy builds this folder. That file is outside the allowed folder.

**If reversed without the owner’s Vercel account:** You cannot. With the account, the switch is still the one in `DEPLOY.md`: set Root Directory to `E-filing updated-Cursor`, and clear any install/build/output override that still says `e-filing-updated/frontend`.

## 11. The public preview is temporary

**Chosen:** Publish https://temporary-brisk-opal-vadjzp4.vercel.app from this folder with `vercel deploy --temporary`. It was loaded in a browser. The home page says Game changer modules. Calculate on Maharashtra, male, residential sale, `5000000` returns a total of ₹3,50,000.

The CLI said this deployment expires at **2026-09-26T11:33:23.489Z** (about 60 minutes after it was created). To keep that deployment, open:

https://vercel.com/claim-deployment?code=95b05a97-6e7b-42a5-a7dc-0a3862353b7d

Claiming it keeps that preview under a Vercel account. It does not move `legal-techai-frontend.vercel.app` onto this folder.

**Why:** A logged-out temporary deploy was the only public URL this environment could create, and the request was to give a working URL if production could not be switched.

**Rejected:** Inventing a production URL, or describing a pull-request preview as this app before loading it. A GitHub preview from the existing Vercel project would still build `e-filing-updated/frontend` until the Root Directory changes.

**If reversed:** The temporary URL is deleted or expires, and there is no public place to click Calculate until the Root Directory is switched or someone deploys this folder again.
