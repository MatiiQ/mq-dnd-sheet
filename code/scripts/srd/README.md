# SRD catalog data

`code/src/data/srd/*.json` is built from the **System Reference Document 5.2.1** (SRD 5.2.1), the current 5.2.x
release on <https://www.dndbeyond.com/srd> as of 2026-10-30. The PDF is
<https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf>.

## Attribution

The SRD is licensed under CC-BY-4.0. Its legal page asks for this statement, word for word:

> This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

The same statement covers the SRD text in the parser fixtures under `code/scripts/srd/fixtures/`.

## Rebuilding

1. Save the PDF as `resources/srd/SRD_CC_v5.2.1.pdf` (gitignored).
2. `code/scripts/srd/extract.sh` writes `resources/srd/srd.txt` (reading order, for prose) and
   `resources/srd/srd-layout.txt` (`pdftotext -layout`, for tables). Needs poppler's `pdftotext`.
3. In `code/`: `npm run srd` parses the text, applies the hand-authored overlays in `code/scripts/srd/overlay/*.json`
   (grants, choices and fields the parser can't read) and writes `code/src/data/srd/*.json`. Every entry is checked
   with `validateEntry` before it is written.
