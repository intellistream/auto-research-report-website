# Speculative Decoding

- Mechanism guide: `src/pages/SpecDecGuide.tsx`.
- Academic survey: the current publication is bound by `public/word-reports/topics.json` and `survey.json`.
- Weekly reports: `weekly/YYYY-MM-DD.json` (one file per edition, named by the end date). The original dynamic research report remains available through the historical report entry.

## Academic survey

Author repository: [specdec-survey/paper-zh](https://github.com/sad-and-bad1231/specdec-survey/tree/main/paper-zh).

Current revision: `zh-survey-final-20261124-webfix2`, version `55a5ac0230875b20dc43011902adf41d3f47d466b4fc871309ac15c265a835ba`. Literature cutoff: 2026-11-24. The 37-page PDF and other manuscript formats are unchanged from the initial Chinese publication; the final HTML and source bundle include the MathML layout fix. Original author assets: `dee4c99e869fa8694cb5fda165b4118fbbdeefc7`; manuscript source: `277cc93278ae714e6d7c7a0223206aa963303db7`.

Publish a clean author build from a `research/specdec-survey-*` branch:

```sh
python scripts/publish-specdec-paper.py --check \
  --source /path/to/specdec-survey/paper-zh/dist \
  --literature-cutoff YYYY-MM-DD --manuscript-revision REVISION
python scripts/publish-specdec-paper.py --publish \
  --source /path/to/specdec-survey/paper-zh/dist \
  --literature-cutoff YYYY-MM-DD --manuscript-revision REVISION
```

Keep the active paper and its version-bound manifest, downloads and source bundle. Retired layout revisions and old author sources are available in Git history, not duplicated in the current checkout.

## Weekly maintenance

Use the existing daily PR index, check the original PRs and relate significant changes to previous editions. Save each new edition as a separate JSON file matching the existing schema; editions load automatically. Keep source IDs, review date, head/base, experimental conditions and cross-edition references consistent. The latest edition is the default view; archived editions remain fixed. Update the outstanding watchlist in `src/pages/specdec-weekly.ts` when follow-up evidence changes.

## Checks

```sh
python -m unittest discover -s scripts
npm ci
npm test
npm run build
```
