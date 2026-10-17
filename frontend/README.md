## Recapit Frontend

Next.js 16 + Tailwind CSS interface for uploading meeting recordings and previewing AI-generated insights.

### Prerequisites

Install the Tailwind v4 toolchain before running the dev server:

```bash
npm install -D tailwindcss @tailwindcss/postcss postcss autoprefixer
```

### Develop locally

```bash
npm run dev
```

Then visit [http://localhost:3000](http://localhost:3000).

#### Key files

- `app/page.tsx` – landing page with the audio upload experience.
- `app/globals.css` – Tailwind v4 entry point using `@theme` tokens and global styles.

### Next steps

1. Connect the upload form to the backend `/api/v1/meetings/upload` endpoint.
2. Add authenticated routes for browsing historical summaries.
3. Extend the UI with charts once analytics endpoints are ready.
