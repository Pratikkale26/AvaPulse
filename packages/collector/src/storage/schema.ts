export const INIT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS rpc_probes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chain TEXT NOT NULL,
  reachable INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  block_number TEXT,
  block_advanced INTEGER NOT NULL,
  chain_id INTEGER,
  error TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rpc_probes_chain_ts ON rpc_probes(chain, timestamp DESC);

CREATE TABLE IF NOT EXISTS gas_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relayer_name TEXT NOT NULL,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  balance_wei TEXT NOT NULL,
  balance_avax REAL NOT NULL,
  min_balance_avax REAL NOT NULL,
  is_low INTEGER NOT NULL,
  is_critical INTEGER NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gas_balances_addr_ts ON gas_balances(chain, address, timestamp DESC);

CREATE TABLE IF NOT EXISTS relayer_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relayer_name TEXT NOT NULL,
  reachable INTEGER NOT NULL,
  delivered_total INTEGER NOT NULL,
  received_total INTEGER NOT NULL,
  errors_total INTEGER NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relayer_snapshots_ts ON relayer_snapshots(relayer_name, timestamp DESC);

CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  source_chain TEXT,
  destination_chain TEXT,
  origin_sender TEXT,
  destination_address TEXT,
  sent_at INTEGER,
  delivered_at INTEGER,
  executed_at INTEGER,
  failed_at INTEGER,
  receipted_at INTEGER,
  latency_seconds REAL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_updated ON messages(updated_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  first_triggered_at INTEGER NOT NULL,
  last_triggered_at INTEGER NOT NULL,
  last_notified_at INTEGER NOT NULL,
  resolved_at INTEGER,
  notification_count INTEGER NOT NULL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status, last_triggered_at DESC);
`
