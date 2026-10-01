# Explained by Plugin

This document records the output of running the Understand-Anything
plugin's `/understand-explain` skill against this `docs/camera-filing-explained/`
folder, following that skill's own instructions exactly (resolve the data
directory, check graph freshness, find the target node, follow its edges,
read connected nodes, identify its layer, read the source, explain). The
honest finding, reached by actually following those steps rather than
asserting it up front, is below.

## Step 1 — Data directory and graph existence

`$UA_DIR` resolves to `.ua/` (no legacy `.understand-anything/` directory
exists). `.ua/knowledge-graph.json` exists, so the skill proceeds rather
than telling the user to run `/understand` first.

## Step 2 — Freshness check

```
GRAPH_COMMIT_RAW = 7401cfabc985d2e02f583d564938ef166a8013ac
git rev-parse HEAD   = 3115fc58606e2cb6f672ed4dfc8ba917412d66ac
```

`git diff --name-only $GRAPH_COMMIT HEAD -- .` (excluding `.ua/`) returns
**31 changed files**, and `git ls-files --others --exclude-standard -- .`
(excluding `.ua/`) lists **every file in `docs/camera-filing-explained/`
and `docs/system-design-of-camera-e-filing/`** as untracked — meaning none
of them existed at all when this graph was built.

Per the skill's own instructions, this is the point to **warn before
explaining that graph-derived context may omit these changes**. That
warning is the real headline finding here, so it's stated plainly rather
than buried: **the graph was built before the entire Camera Filing →
Live Sale Deed Generation feature existed in this repository**, and before
this documentation folder existed. The committed-diff list includes
`backend/routers/drafting.py`, every file in `backend/modules/drafting/`,
`frontend/src/app/file-case/page.tsx` in its current form, and every
frontend lib/component file the `camera-filing-explained/` documents
cover — i.e., essentially the entire subject matter of this folder.

## Step 3 — Finding the target node

The target given to the skill was the folder path itself,
`docs/camera-filing-explained`. Searching the graph for that string:

```
grep -c "camera-filing-explained" .ua/knowledge-graph.json
→ 0
```

**No node matches.** This folder is not represented in the knowledge graph
at all — not as a `document` node, not under any other type — because, per
step 2, it didn't exist yet when the graph was analyzed. There is no
`id`, `summary`, `tags`, or `complexity` to report for it.

Broadening the search to the feature this folder documents:

```
grep -c "file-case"              .ua/knowledge-graph.json  → 20 matches
grep -c "\"drafting"             .ua/knowledge-graph.json  → 1 match
grep -c "modules/drafting"       .ua/knowledge-graph.json  → 0 matches
```

### What the 20 `file-case` matches actually are

All 20 trace back to exactly two nodes — and both are informative
precisely because of what they reveal about the graph's age:

**`file:frontend/src/app/file-case/page.tsx`** (and its one function node,
`FileCasePage`) — this *is* the real file, but the graph's own recorded
summary describes a version that no longer exists:

> "Next.js client page for filing a case: collects a case title and type,
> then walks required documents through camera capture or upload, OCR
> extraction, review, and batch submit."
>
> `languageNotes`: "Client component with an inner flow-state machine
> (IDLE/CAPTURE/PROCESSING/SUBMITTED) and nested camera/OCR helpers..."
>
> `lineRange`: [64, 485]

Compare this against `docs/camera-filing-explained/02-frontend-main-page.md`,
written directly from the current source: the real state machine today has
**six** states (`IDLE/CAPTURE/PROCESSING/REVIEW/GENERATING/SUBMITTED` — the
graph's recorded version is missing `REVIEW` and `GENERATING` entirely,
which is exactly the live Sale Deed drafting and generation UI this whole
documentation folder is about), the file is **884 lines** today (the
graph recorded 485), and the graph's summary calls the extraction step
generic "OCR extraction" with no mention of the Gemini-based structured
extraction, the checklist-scoped prompts, the merge/provenance system, or
live deed generation at all — none of which existed yet at the commit the
graph was built from.

**`file:e-filing-updated/frontend/src/app/file-case/page.tsx`** — the
other 10 or so matches are a *different, unrelated* file in the
`e-filing-updated/` experimental duplicate tree (`DECISIONS.md` decision
1 explains this tree is an abandoned parallel experiment with no deploy
path). Its one function node is literally named `LiveCompilationEngine` —
a different concept from anything this documentation folder covers, and
not part of the deployed Camera Filing feature at all.

### What the 1 `"drafting` match is

`file:e-filing-updated/backend/routers/drafting.py` — again, the
*unrelated* `e-filing-updated` experiment's own drafting router (summary:
"accepts mode_a or mode_b generation requests and streams a DOCX petition
or PDF application"), not `backend/routers/drafting.py`, the real,
deployed router that `docs/camera-filing-explained/05-backend-api-router.md`
documents. **`modules/drafting/` — the entire extraction/generator/stream/
pdf/docx-export engine — has zero matches in the graph.** It does not
exist there in any form.

## Steps 4–6 — Edges, neighbors, layer

Since there is no node for the actual target (`docs/camera-filing-explained`),
and the one real-path node that exists (`file:frontend/src/app/file-case/page.tsx`)
describes a superseded version of the file, following its edges and layer
assignment would describe the *old* feature's connections — `imports`
edges to an `OCR`-labelled extraction path and a plain batch-submit
endpoint, not to `/drafting/extract`, `/drafting/merge`, `/drafting/generate`,
or `/drafting/export/*`, none of which existed in the codebase at the
graph's commit. Reporting those edges here would misrepresent the current
system, so they're omitted rather than presented as if current.

## Step 7–8 — Conclusion, instead of a fabricated explanation

The honest, complete answer the plugin's own methodology produces for this
target is: **the knowledge graph has no usable information about
`docs/camera-filing-explained/` or the Camera Filing → Live Sale Deed
Generation feature it documents.** The graph predates this feature
entirely, and the one same-path node it does contain describes an earlier,
substantially simpler version of `file-case/page.tsx` (no drafting
engine, no live generation, no PDF/DOCX export, four flow states instead
of six).

For a graph-grounded explanation of this folder and the feature it covers,
the graph needs to be rebuilt first:

```
/understand --full
```

Until then, the authoritative, accurate explanation of this feature is the
hand-written documentation already in this same folder — `README.md`
through `10-backend-pdf-and-docx-export.md` — written directly from the
current source rather than from the graph, which is exactly why it doesn't
share this gap.
