#!/bin/sh
# Extracts the SRD 5.2.1 PDF into text: plain reading order for prose, -layout for tables.
# Run from the repo root or code/; reads and writes resources/srd/ (gitignored).
set -e
cd "$(git rev-parse --show-toplevel)/resources/srd"
pdftotext -enc UTF-8 SRD_CC_v5.2.1.pdf srd.txt
pdftotext -enc UTF-8 -layout SRD_CC_v5.2.1.pdf srd-layout.txt
wc -l srd.txt srd-layout.txt
