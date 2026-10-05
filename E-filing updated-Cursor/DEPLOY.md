# Put this folder on the live site

The site [https://legal-techai-frontend.vercel.app/](https://legal-techai-frontend.vercel.app/) does **not** serve this folder yet.

The repo-root `vercel.json` still tells Vercel to build `e-filing-updated/frontend`. That copy has no stamp duty page. This file does not edit that `vercel.json`. The old app stays the live app until you change one setting in the Vercel dashboard.

## The one setting

1. Open the Vercel project that owns `legal-techai-frontend.vercel.app`.
2. Go to **Settings → Build and Deployment**.
3. Set **Root Directory** to exactly:

   ```
   E-filing updated-Cursor
   ```

   The space and the capital E are part of the name. Do not point it at `e-filing-updated` or `frontend`.
4. Save. Redeploy the production branch (or push this folder to the branch Vercel already builds).

Vercel then treats this folder as the app. It will use this folder's `package.json` (`npm install`, `npm run build`) and this folder's `vercel.json` (`framework: nextjs`). It will not use the parent `vercel.json`, because that file sits outside the new root.

## Check the command boxes

After you change the root, look at Install Command, Build Command, and Output Directory.

They should be the normal Next.js ones, run inside `E-filing updated-Cursor`:

- Install: `npm install` (or empty, so Vercel uses the default)
- Build: `npm run build` (or empty, so Vercel uses the default)
- Output: leave it empty for Next.js. Do not set `e-filing-updated/frontend/.next`

If those boxes still contain `cd e-filing-updated/frontend`, clear the overrides. Otherwise the new root will look for a folder that is not inside it, and the deploy will fail.

## How to know it worked

Open `https://legal-techai-frontend.vercel.app/`.

- The home page says **Game changer modules**.
- **Open the Stamp Duty Engine** goes to `/stamp-duty`.
- Calculate with Maharashtra, male, residential sale, value `5000000`. The total is ₹3,50,000.
- The words Investor Showcase are not the module heading.

A pull-request preview is not proof, unless that preview was built after the Root Directory change. Until then, previews use the same project setting and still build the old frontend.

## What was tried from this environment

There is no Vercel token here, and `vercel whoami` is logged out. The CLI cannot see the project that owns `legal-techai-frontend.vercel.app`. GitHub access from this environment also cannot list that repo’s deployments (HTTP 403).

`vercel deploy --temporary` was used on **this folder only**. That created an anonymous preview. It did not change the existing project’s Root Directory, and it was not a production deploy of `legal-techai-frontend`.

- Preview (expires **2026-09-26T11:33:23.489Z**): https://temporary-brisk-opal-vadjzp4.vercel.app
- Claim it if you want to keep that deployment: https://vercel.com/claim-deployment?code=95b05a97-6e7b-42a5-a7dc-0a3862353b7d

Claiming keeps the preview. It does not point `legal-techai-frontend.vercel.app` at this folder. After the expiry, use the Root Directory steps above, or run `vercel deploy --temporary` again from this folder.

A check of the production home page after the preview was created still showed **Investor Showcase** and did not show **Game changer modules**.
