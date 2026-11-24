# Final SpecDec Chinese survey

Reviewed source: [specdec-survey/paper-zh at ca70c26](https://github.com/sad-and-bad1231/specdec-survey/tree/ca70c26ae5d8abc2f1cd9e7807719c8e239f4742/paper-zh). The old `paper/` directory is the historical 2026-11-19 source, not the new author build.

Use the complete clean-checkout author `paper-zh/dist` directory. The reviewed 37-page PDF has a one-page table-of-contents offset; refresh the table of contents before freezing the publication and regenerate the author manifest with the build script.

From the editorial branch `research/specdec-survey-final-20261124`:

```sh
python scripts/publish-specdec-paper.py --check \
  --source /path/to/specdec-survey/paper-zh/dist \
  --literature-cutoff 2026-11-24 \
  --manuscript-revision zh-survey-final-20261124

python scripts/publish-specdec-paper.py --publish \
  --source /path/to/specdec-survey/paper-zh/dist \
  --literature-cutoff 2026-11-24 \
  --manuscript-revision zh-survey-final-20261124

python -m unittest discover -s scripts
npm ci
npm test
npm run build
```

Review the local `?view=paper` page, including chapter navigation, equations, four figures, four tables, citations, and PDF/Word/source downloads. The new immutable paper archive, SpecDec's academicPaper index and four route bindings are the only expected publication changes. Preserve the report, candidate baseline, guide content, ACLGraph and historical paper versions. No deployment or main merge is performed by this script.
