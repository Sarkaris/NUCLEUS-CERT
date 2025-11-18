## Certificate Nucleus

Generate polished participation or award certificates directly in the browser. Upload an Excel sheet with recipient names, fine‑tune text placement in the live preview, and export a ZIP bundle of PNG certificates—everything runs locally in the client.

## Highlights

- Excel ingestion with automatic column detection and support for headers.
- Drag-and-drop positioning with pixel readout for precise alignment.
- Real-time font size/color adjustments plus template image upload or reset.
- Browser-side JSZip + Canvas pipeline keeps data on the user’s machine.
- Light/Dark UI toggle for comfortable on-site editing during events.

## Certificate Font Library

The font selector now ships with ten popular display/script faces, with `Algerian` pinned to the top of the list:

1. Algerian (system/CDN serif)
2. Playfair Display
3. Great Vibes
4. Cinzel
5. Cormorant Garamond
6. Pinyon Script
7. Sacramento
8. Montserrat
9. Raleway
10. Roboto Slab

> Tip: The UI automatically loads these fonts from Google Fonts/CDN so preview and exports stay consistent.

## Getting Started

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` and start by uploading `sample.xlsx` (included under `public/`) to try the workflow.

## Build & Deploy

```bash
npm run build   # production build
npm start       # serve .next output
```

For cloud hosting (Vercel, Netlify, Render, etc.), deploy the contents of this repo and set the build command to `npm run build` with output directory `.next`. No environment variables are required.

## Project Structure

- `src/app/page.tsx` – main UI logic (uploading, preview, ZIP generation).
- `src/app/globals.css` – Tailwind + custom palette and font imports.
- `public/` – static assets such as the default certificate template and sample workbook.

Feel free to fork and adapt—for example, to bake in brand colors, default templates, or organization-specific messaging.
