#!/usr/bin/env bash
# Rebuild from paper.md, references.bib and TikZ sources.
# Requires Pandoc 3+, XeLaTeX with ctex/TikZ/standalone, Poppler and Noto CJK.
set -euo pipefail

cd -- "$(dirname -- "$0")"
source_dir=$PWD
build_dir=$(mktemp -d)
trap 'rm -rf -- "$build_dir"' EXIT

# Default to the literature cutoff for stable PDF metadata.
export SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH:-1794960000}

cp paper.md references.bib numeric.csl paper.css paper-header.tex "$build_dir/"
mkdir "$build_dir/figures"
cp figures/*.tex "$build_dir/figures/"
cd -- "$build_dir"

latex() {
  local input=$1
  if ! xelatex -no-shell-escape -interaction=nonstopmode -halt-on-error "$input" > "${input%.tex}.stdout"; then
    tail -60 "${input%.tex}.stdout" >&2
    return 1
  fi
}

(
  cd figures
  for input in *.tex; do
    latex "$input"
    pdftoppm -r 210 -png -singlefile "${input%.tex}.pdf" "${input%.tex}"
  done
)

common=(--from=markdown --citeproc --bibliography=references.bib --csl=numeric.csl
  --metadata=link-citations:true --number-sections --standalone)

pandoc paper.md "${common[@]}" --metadata=lang:en-US -V lang=zh-CN --mathml --embed-resources --css=paper.css --output=paper.html

# Use vector figures for LaTeX and portable embedded images for HTML.
sed -E 's|(figures/[a-z0-9-]+)\.png|\1.pdf|g' paper.md |
  pandoc "${common[@]}" --to=latex --metadata=lang:en-US \
    --include-in-header=paper-header.tex \
    -V documentclass=ctexart -V classoption=UTF8 -V classoption=fontset=none \
    -V classoption=zihao=5 -V papersize=a4 -V geometry=margin=23mm \
    -V mainfont='Latin Modern Roman' -V CJKmainfont='Noto Serif CJK SC' \
    -V CJKsansfont='Noto Sans CJK SC' -V CJKmonofont='Noto Sans Mono CJK SC' \
    --output=paper.tex

latex paper.tex
latex paper.tex
if grep -En 'LaTeX Warning:.*undefined|Missing character:|Overfull \\hbox' paper.log; then
  exit 1
fi

cp paper.tex paper.pdf paper.html "$source_dir/"
cp figures/*.pdf figures/*.png "$source_dir/figures/"
