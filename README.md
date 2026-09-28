# haoyou.dev

Haoxuan You's personal site. Source of truth; auto-deploys to Cloudflare Workers on push to `main`.

- `public/` — the static site (pure HTML/CSS/JS, no build step)
  - `index.html` — Home: hero, engineering journey, impact metrics, contact
  - `about.html` — About: bio, capabilities, education & certifications
  - `experience.html` — Experience timeline, patents & publications
  - `projects.html` — Cell-to-module process, selected work
  - `assets/site.css`, `assets/site.js` — shared styles and video/scroll behavior
  - `media/` — all videos, posters and portrait, served same-origin from the Worker
- `wrangler.jsonc` — Workers Static Assets config (worker `haoyou-dev`)

Media notes: the R2 bucket `haoyou-dev-assets` exists with its public r2.dev
domain enabled as a future home for video assets; the current deploy serves
media from `public/media/` so the site works with zero extra configuration.
