-- Vibe Database — Extensions
-- Enables the minimal set of PostgreSQL extensions required by the application.

-- pgcrypto: Provides cryptographic functions used for UUID generation
-- and hash-based operations.
create extension if not exists "pgcrypto" with schema "extensions";

-- pg_trgm: Provides trigram-based text search capabilities
-- for future search features (profiles, posts, communities).
create extension if not exists "pg_trgm" with schema "extensions";

-- Confirm extensions are available
select
  extname,
  extversion
from
  pg_extension
where
  extname in ('pgcrypto', 'pg_trgm');
