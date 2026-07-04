# Card Trader — deploy guide

A web app for cataloging Pokemon/Magic/sports cards, adding friends, matching
up trades, and tracking collection value. Runs on Cloudflare Workers + D1,
free tier is plenty for a group of kids.

## What's in here
- `src/index.js` — the API (Hono framework, runs as a Cloudflare Worker)
- `public/index.html` — the whole frontend (one file, no build step)
- `schema.sql` — the database tables
- `wrangler.toml` — Cloudflare config

## Setup (one time)

1. Install dependencies:
   ```
   cd card-trader
   npm install
   ```

2. Log into Cloudflare (opens a browser):
   ```
   npx wrangler login
   ```

3. Create the D1 database:
   ```
   npx wrangler d1 create card-trader-db
   ```
   This prints a `database_id`. Copy it into `wrangler.toml` where it says
   `REPLACE_WITH_YOUR_DATABASE_ID`.

4. Load the schema into the database:
   ```
   npx wrangler d1 execute card-trader-db --remote --file=./schema.sql
   ```

## Deploy

```
npx wrangler deploy
```

Wrangler prints a URL like `https://card-trader.yourname.workers.dev` — that's
the link you send your son's friends. No app store, no separate API keys.

## Local testing before deploy

```
npx wrangler d1 execute card-trader-db --local --file=./schema.sql
npx wrangler dev
```

## How card lookup + pricing works
- **Pokemon** — search by name against the free pokemontcg.io API, which also
  returns current TCGPlayer market price. Picking a result autofills name,
  set, card number, and value.
- **Magic: The Gathering** — same idea, using the free Scryfall API, which
  also returns current USD market price.
- **Sports** — no solid free API exists for this, so it's fully manual:
  manufacturer (Topps, Upper Deck, Panini, etc.), year, player name, set, and
  a value you type in yourself.
- Every card in the collection screen has a **↻ refresh** button (Pokemon/
  Magic only) that re-checks the current price and updates it — useful since
  card values move around.
- The **Collection value** banner at the top sums up everything a kid *owns*
  (not want-list items), broken down by category.

## Notes / limitations
- **Login is username + 4-digit PIN**, no email, no password reset. Fine for
  a kid's friend group — don't reuse this pattern for anything with real
  money or personal data behind it.
- Prices are a snapshot from the lookup API at the moment a card is added or
  refreshed, not live continuously updating quotes. Treat them as ballpark,
  not gospel — actual sale prices vary with condition, grading, and demand.
- Trade "propose" currently records an offer but the actual card doesn't move
  between collections when accepted — it just marks status. If you want an
  accepted trade to actually swap ownership of the cards, that's a small
  addition, just say the word.

## Suggested next steps once it's live
- Photo upload for cards (thumbnails of the real physical card, not just data)
- Push notifications when a trade is proposed
- A dedicated "want list" view per kid

