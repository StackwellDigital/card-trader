import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();
app.use('/api/*', cors());

// ---------- helpers ----------
async function findUser(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
}

// ---------- auth ----------
app.post('/api/signup', async (c) => {
  const { username, pin } = await c.req.json();
  if (!username || !pin) return c.json({ error: 'username and pin required' }, 400);
  const existing = await findUser(c.env.DB, username);
  if (existing) return c.json({ error: 'username taken' }, 409);
  const result = await c.env.DB.prepare(
    'INSERT INTO users (username, pin) VALUES (?, ?)'
  ).bind(username, pin).run();
  return c.json({ id: result.meta.last_row_id, username });
});

app.post('/api/login', async (c) => {
  const { username, pin } = await c.req.json();
  const user = await findUser(c.env.DB, username);
  if (!user || user.pin !== pin) return c.json({ error: 'invalid login' }, 401);
  return c.json({ id: user.id, username: user.username });
});

// ---------- cards ----------
app.get('/api/cards/:userId', async (c) => {
  const userId = c.req.param('userId');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM cards WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all();
  return c.json(results);
});

app.post('/api/cards', async (c) => {
  const b = await c.req.json();
  const result = await c.env.DB.prepare(
    `INSERT INTO cards (user_id, category, name, set_name, card_number, manufacturer, year, condition, quantity, wants, value_usd, image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    b.user_id, b.category, b.name, b.set_name || null, b.card_number || null,
    b.manufacturer || null, b.year || null, b.condition || null, b.quantity || 1,
    b.wants ? 1 : 0, b.value_usd ?? null, b.image_url || null
  ).run();
  return c.json({ id: result.meta.last_row_id });
});

app.patch('/api/cards/:id/value', async (c) => {
  const { value_usd } = await c.req.json();
  await c.env.DB.prepare('UPDATE cards SET value_usd = ? WHERE id = ?')
    .bind(value_usd, c.req.param('id')).run();
  return c.json({ ok: true });
});

app.delete('/api/cards/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM cards WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// total value of everything a user OWNS (not want-list items)
app.get('/api/collection-value/:userId', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT category, COALESCE(SUM(value_usd * quantity), 0) AS subtotal, COUNT(*) AS card_count
     FROM cards WHERE user_id = ? AND wants = 0 GROUP BY category`
  ).bind(c.req.param('userId')).all();
  const total = results.reduce((sum, r) => sum + r.subtotal, 0);
  return c.json({ total, by_category: results });
});

// ---------- friends ----------
app.post('/api/friends', async (c) => {
  const { user_id, friend_username } = await c.req.json();
  const friend = await findUser(c.env.DB, friend_username);
  if (!friend) return c.json({ error: 'no user with that username' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)').bind(user_id, friend.id),
    c.env.DB.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)').bind(friend.id, user_id),
  ]);
  return c.json({ ok: true, friend: { id: friend.id, username: friend.username } });
});

app.get('/api/friends/:userId', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.username FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?`
  ).bind(c.req.param('userId')).all();
  return c.json(results);
});

// find trade matches: cards I HAVE that friend WANTS, and vice versa
app.get('/api/matches/:userId/:friendId', async (c) => {
  const { userId, friendId } = c.req.param();
  const db = c.env.DB;
  const iCanGive = await db.prepare(
    `SELECT * FROM cards WHERE user_id = ? AND wants = 0
     AND name IN (SELECT name FROM cards WHERE user_id = ? AND wants = 1)`
  ).bind(userId, friendId).all();
  const theyCanGive = await db.prepare(
    `SELECT * FROM cards WHERE user_id = ? AND wants = 0
     AND name IN (SELECT name FROM cards WHERE user_id = ? AND wants = 1)`
  ).bind(friendId, userId).all();
  return c.json({ i_can_give: iCanGive.results, they_can_give: theyCanGive.results });
});

// ---------- trades ----------
app.post('/api/trades', async (c) => {
  const b = await c.req.json();
  const result = await c.env.DB.prepare(
    `INSERT INTO trades (from_user, to_user, offer_card_id, request_card_id) VALUES (?, ?, ?, ?)`
  ).bind(b.from_user, b.to_user, b.offer_card_id, b.request_card_id).run();
  return c.json({ id: result.meta.last_row_id });
});

app.get('/api/trades/:userId', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM trades WHERE to_user = ? OR from_user = ? ORDER BY created_at DESC`
  ).bind(c.req.param('userId'), c.req.param('userId')).all();
  return c.json(results);
});

app.post('/api/trades/:id/respond', async (c) => {
  const { status } = await c.req.json(); // 'accepted' or 'declined'
  await c.env.DB.prepare('UPDATE trades SET status = ? WHERE id = ?')
    .bind(status, c.req.param('id')).run();
  return c.json({ ok: true });
});

// ---------- pokemon card lookup (free public API, no key needed) ----------
app.get('/api/lookup/pokemon', async (c) => {
  const name = c.req.query('name');
  if (!name) return c.json({ error: 'name query param required' }, 400);
  try {
    const res = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(name)}*&pageSize=15`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) {
      return c.json({ error: `pokemon API returned ${res.status}` }, 502);
    }
    const data = await res.json();
    const cards = (data.data || []).map((card) => {
      const prices = card.tcgplayer?.prices || {};
      const variant = Object.values(prices).find((v) => v?.market != null);
      return {
        name: card.name,
        set_name: card.set?.name,
        card_number: card.number,
        image_url: card.images?.small,
        value_usd: variant?.market ?? null,
      };
    });
    return c.json(cards);
  } catch (err) {
    return c.json({ error: 'pokemon lookup failed: ' + err.message }, 500);
  }
});

// ---------- magic: the gathering lookup (Scryfall, free, no key needed) ----------
app.get('/api/lookup/magic', async (c) => {
  const name = c.req.query('name');
  if (!name) return c.json({ error: 'name query param required' }, 400);
  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(name)}&order=released`,
      { headers: { Accept: 'application/json', 'User-Agent': 'CardTraderApp/1.0' } }
    );
    if (res.status === 404) return c.json([]); // Scryfall 404s when there are zero matches
    if (!res.ok) return c.json({ error: `magic API returned ${res.status}` }, 502);
    const data = await res.json();
    const cards = (data.data || []).slice(0, 15).map((card) => ({
      name: card.name,
      set_name: card.set_name,
      card_number: card.collector_number,
      image_url: card.image_uris?.small,
      value_usd: card.prices?.usd ? parseFloat(card.prices.usd) : (card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : null),
    }));
    return c.json(cards);
  } catch (err) {
    return c.json({ error: 'magic lookup failed: ' + err.message }, 500);
  }
});

// re-check current market price for a card already in a collection
app.post('/api/cards/:id/refresh-price', async (c) => {
  const id = c.req.param('id');
  const card = await c.env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind(id).first();
  if (!card) return c.json({ error: 'card not found' }, 404);
  if (card.category === 'sports') return c.json({ error: 'sports card prices are manual only' }, 400);

  const lookupPath = card.category === 'magic' ? 'magic' : 'pokemon';
  const res = await fetch(`https://${c.req.header('host')}/api/lookup/${lookupPath}?name=${encodeURIComponent(card.name)}`);
  const matches = await res.json();
  const match = matches.find((m) => m.set_name === card.set_name && m.card_number === card.card_number) || matches[0];
  if (!match || match.value_usd == null) return c.json({ error: 'no current price found' }, 404);

  await c.env.DB.prepare('UPDATE cards SET value_usd = ? WHERE id = ?').bind(match.value_usd, id).run();
  return c.json({ value_usd: match.value_usd });
});

// ---------- static frontend ----------
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
