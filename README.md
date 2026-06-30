# Image → Excel

A fully client-side web app that turns **UPI payment screenshots** (Google Pay,
PhonePe, Paytm, PayZapp) into a structured spending log and exports it to Excel.
From each screenshot it extracts the **app, recipient, amount, transaction ID,
date & time, and note/purpose**. (Generic regex templates — e.g. receipts — are
also supported via the template editor.)

It runs entirely on-device: text is extracted, structured, stored, and exported
in the browser.

**Privacy by construction:** images are decoded, OCR'd, and parsed entirely in your
browser. No image is ever sent to any server, API, or cloud service. The only
network traffic is the one-time download of the app and the OCR engine.

## Stack

| Concern | Choice |
| --- | --- |
| Build / framework | Vite + Svelte + TypeScript |
| OCR | [Tesseract.js](https://github.com/naptha/tesseract.js) (WASM, single-threaded) |
| Structuring | Template-based regex extraction (`src/parse/`) |
| Storage | IndexedDB via [Dexie](https://dexie.org/) |
| Excel export | [SheetJS](https://sheetjs.com/) (`xlsx`) |
| Hosting | GitHub Pages (static) |

## Develop

```bash
yarn install
yarn dev          # http://localhost:5173
yarn typecheck    # type-check Svelte + TS
yarn build        # outputs static site to dist/
yarn preview      # serve the production build locally
```

## Deploy (GitHub Pages)

1. Push to a repo named `image-to-excel` (the `base` in `vite.config.ts` must match
   the repo name — change both together if you rename it).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`; `.github/workflows/deploy.yml` builds and publishes automatically.

## How it works

```
upload → normalizeImage (downscale + grayscale) → Tesseract OCR
       → applyTemplate (regex → fields) → IndexedDB
       → review/edit table → SheetJS → .xlsx download
```

- The default **UPI template** uses a dedicated parser (`src/parse/upi.ts`) that
  handles the differing layouts of GPay / PhonePe / Paytm / PayZapp, rather than a
  single regex. Other templates (*Receipt*, *Meter reading*) use per-field regex.
- Low-confidence fields are highlighted in the table for manual review; edits are
  saved immediately and mark the field as trusted.
- **Backup / Restore** (JSON) guards against browser storage eviction — export
  periodically, since IndexedDB is device-local and not synced.

## Roadmap

- **Phase 2:** in-app template editor, batch queue with concurrency control,
  PWA/offline (self-hosted `tessdata`), styled multi-sheet export (ExcelJS).
- **Phase 3:** zonal extraction for fixed forms; optional local LLM/ONNX OCR
  (WebGPU) for higher accuracy — still 100% on-device.

## Notes

- The single-threaded Tesseract build is used so the app works on GitHub Pages,
  which cannot set the COOP/COEP headers required for threaded WASM. To use the
  faster threaded build, host on Cloudflare Pages / Netlify with those headers.
- For full offline use, vendor the Tesseract worker, core WASM, and `eng.traineddata`
  locally instead of loading them from the default CDN.
