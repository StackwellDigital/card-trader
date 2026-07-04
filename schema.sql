-- Card Trader DB schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  pin TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,        -- 'pokemon', 'magic', or 'sports'
  name TEXT NOT NULL,
  set_name TEXT,
  card_number TEXT,
  manufacturer TEXT,             -- sports cards: Topps, Upper Deck, Panini, etc.
  year TEXT,                     -- sports cards: e.g. 2023
  condition TEXT,
  quantity INTEGER DEFAULT 1,
  wants INTEGER DEFAULT 0,       -- 0 = have it, 1 = wants it
  value_usd REAL,                -- estimated market value per card, in USD
  image_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user INTEGER NOT NULL,
  to_user INTEGER NOT NULL,
  offer_card_id INTEGER NOT NULL,
  request_card_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, accepted, declined
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_to ON trades(to_user);
