# D&D Character Sheet

Interactive D&D 2024 character sheet for iPad, installed from Safari as a Home Screen web app. Works offline; characters are saved on the device.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173, also reachable from the iPad on the same Wi-Fi
npm test         # rules logic (damage, healing, rests, conditions)
npm run build    # production build in dist/
npm run preview  # serve dist/ (service worker active)
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` tests, builds and publishes on every push to `main`.
One-time setup: in the repo on GitHub, Settings › Pages › Source: **GitHub Actions**.

## Install on iPad

Open the Pages URL in Safari › Share › **Add to Home Screen** (keep "Open as Web App" on).

Data lives only in that Home Screen app. Deleting the icon deletes the characters, so use
Menu › Backup › **Export all** now and then (saves a JSON file to Files / iCloud Drive).
