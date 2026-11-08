CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  title VARCHAR(100) NOT NULL DEFAULT 'TraceLab location demo',
  image_url TEXT,
  image_storage_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS location_reports (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m DOUBLE PRECISION NOT NULL CHECK (accuracy_m >= 0 AND accuracy_m <= 1000000),
  consent_version VARCHAR(40) NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_reports_received_at ON location_reports(received_at DESC);
