-- Preserve V1 unchanged for existing installations.
CREATE TABLE cf_users (
  id VARCHAR(36) PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE cf_login_codes (
  id VARCHAR(36) PRIMARY KEY, email VARCHAR(254) NOT NULL, code_hash VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, consumed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX cf_codes_email_time ON cf_login_codes(email, created_at);
CREATE TABLE cf_sections (
  id VARCHAR(80) PRIMARY KEY, source VARCHAR(12) NOT NULL, term VARCHAR(6) NOT NULL,
  crn VARCHAR(20) NOT NULL, code VARCHAR(20) NOT NULL, title VARCHAR(255) NOT NULL,
  section_number VARCHAR(20) NOT NULL, instructor VARCHAR(255) NOT NULL,
  meeting_summary VARCHAR(1000) NOT NULL, capacity INTEGER NOT NULL,
  available INTEGER NOT NULL, checked_at TIMESTAMPTZ NOT NULL,
  last_attempt_at TIMESTAMPTZ NOT NULL, error_message VARCHAR(300), UNIQUE(source, term, crn)
);
CREATE TABLE cf_watches (
  id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL REFERENCES cf_users(id) ON DELETE CASCADE,
  section_id VARCHAR(80) NOT NULL REFERENCES cf_sections(id),
  threshold INTEGER NOT NULL CHECK(threshold BETWEEN 1 AND 100), enabled BOOLEAN NOT NULL DEFAULT TRUE,
  matched BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL, UNIQUE(user_id, section_id)
);
CREATE INDEX cf_watches_section ON cf_watches(section_id, enabled);
CREATE TABLE cf_samples (
  id VARCHAR(36) PRIMARY KEY, section_id VARCHAR(80) NOT NULL REFERENCES cf_sections(id),
  available INTEGER NOT NULL, capacity INTEGER NOT NULL, checked_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX cf_samples_section_time ON cf_samples(section_id, checked_at);
CREATE TABLE cf_notifications (
  id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL REFERENCES cf_users(id) ON DELETE CASCADE,
  section_id VARCHAR(80) NOT NULL REFERENCES cf_sections(id), body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL, read_at TIMESTAMPTZ, delivery VARCHAR(12) NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL, sent_at TIMESTAMPTZ
);
CREATE INDEX cf_notifications_due ON cf_notifications(delivery, next_attempt_at);
