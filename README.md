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

## Deploying

Vercel is **not** hooked to every git push. GitHub Actions runs tests and a
Next.js build on each pull request and on `main` — that is the preview check
and it does not count toward the Vercel deployment cap.

When the change is ready to go live:

1. In GitHub: **Actions → Deploy production → Run workflow**, or
2. In Vercel: **Deployments → Create Deployment** from `main`.

The GitHub deploy job needs three repository secrets (`VERCEL_TOKEN`,
`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) from the Vercel project settings.
Until those are set, use the Vercel dashboard button.

## What's still needed (not in this codebase yet)

- **Supabase** — a real database for customers, agreements and payments,
  plus login. The portal page currently shows one hard-coded agreement.
- **GoCardless webhook** — a route that listens for payment events and
  updates the database, so the "up to date" status on the portal page is
  real rather than mocked.
- **Companies House lookup** — the apply drawer's company search currently
  uses six fake sample companies. Swapping in the real Companies House API
  is a small, well-defined piece of work once the rest is live.
