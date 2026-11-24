# Final SpecDec Chinese survey

Reviewed source: [specdec-survey/paper-zh at ca70c26](https://github.com/sad-and-bad1231/specdec-survey/tree/ca70c26ae5d8abc2f1cd9e7807719c8e239f4742/paper-zh). The old `paper/` directory is the historical 2026-11-19 source, not the new author build.

Frozen revision: `zh-survey-final-20261124`, version `fb929a22ef57cc9a696df3dadd3bd6aed68bb18dd37b8096c2c2bd05d5cc8f3b`.

Author assets were retrieved at `dee4c99e869fa8694cb5fda165b4118fbbdeefc7`, built from `277cc93278ae714e6d7c7a0223206aa963303db7`. All seven original dist asset SHA-256 digests matched the author manifest. Its sourceDirty flag was true: the exported Markdown matches the pinned chapter sources after line-ending normalization, and the chapter files, four SVGs, bibliography and build script in the author source archive match that pinned commit. The PDF compilation log reports 37 pages and no unresolved references or rerun warnings. The six primary publication files are copied byte-for-byte; the public source archive is rebuilt using the academic importer's source whitelist, as a deterministic ZIP with stored entries. The author build log and author-specific source package are not published. Future publications should use a clean-checkout author build and the Python staging command below.

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
