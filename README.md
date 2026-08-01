# Future FG Website

A Next.js site for Future F G Limited — public homepage plus a customer
settlement portal prototype.

## What's here

- `app/page.tsx` — the public homepage (funding solutions, apply drawer, etc.)
- `app/portal/page.tsx` — the customer settlement page (currently using
  hard-coded data from agreement HP93 as a placeholder — this will be
  replaced with real data from Supabase once that's connected)
- `app/globals.css` — all styling and design tokens (brand blue #0E8CF5,
  navy, gold accent)
- `public/office.jpg` — the office photo used on the homepage

## Deploying (no coding needed)

1. Upload all of these files to the `ffg-website` GitHub repo, keeping the
   folder structure intact (drag the whole extracted folder into GitHub's
   "Add file → Upload files" screen).
2. Go to vercel.com, click **Add New → Project**, and import the
   `ffg-website` repo.
3. Vercel will detect it's a Next.js project automatically — just click
   **Deploy**.
4. Once deployed, go to the project's **Settings → Domains** in Vercel and
   add your domain. Vercel will give you DNS records to add wherever your
   domain is registered.

## What's still needed (not in this codebase yet)

- **Supabase** — a real database for customers, agreements and payments,
  plus login. The portal page currently shows one hard-coded agreement.
- **GoCardless webhook** — a route that listens for payment events and
  updates the database, so the "up to date" status on the portal page is
  real rather than mocked.
- **Companies House lookup** — the apply drawer's company search currently
  uses six fake sample companies. Swapping in the real Companies House API
  is a small, well-defined piece of work once the rest is live.
