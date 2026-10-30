#!/bin/sh
# Extracts the SRD 5.2.1 PDF into text, into resources/srd/ (gitignored). Needs poppler's pdftotext.
# srd.txt: prose in reading order. pdftotext's own reading order mixes the two columns on some pages, so each page
#   is cropped into its left and right half and read top to bottom; a form feed separates pages.
# srd-layout.txt: pdftotext -layout, for tables that span both columns.
set -e
cd "$(git rev-parse --show-toplevel)/resources/srd"
pdf=SRD_CC_v5.2.1.pdf
pages=$(pdfinfo "$pdf" | awk '/^Pages:/ {print $2}')
: > srd.txt
p=1
while [ "$p" -le "$pages" ]; do
  [ "$p" -gt 1 ] && printf '\f' >> srd.txt
  pdftotext -enc UTF-8 -f "$p" -l "$p" -x 0 -y 0 -W 297 -H 783 "$pdf" - | tr -d '\f' >> srd.txt
  pdftotext -enc UTF-8 -f "$p" -l "$p" -x 297 -y 0 -W 297 -H 783 "$pdf" - | tr -d '\f' >> srd.txt
  p=$((p + 1))
done
pdftotext -enc UTF-8 -layout "$pdf" srd-layout.txt
wc -l srd.txt srd-layout.txt
