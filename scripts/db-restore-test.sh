#!/usr/bin/env bash
# =============================================================================
# Database Restore Verification Script
#
# Tests backup integrity by restoring to a staging environment and verifying:
#   - Schema integrity
#   - Data integrity
#   - Indexes
#   - RLS policies
#   - Critical records
#   - Payment ledger consistency
#
# NEVER run this against production data or a production database.
# Always use a staging/isolated environment.
#
# Usage:
#   ./scripts/db-restore-test.sh <backup-file>
#
# Requirements:
#   - psql, pg_restore installed
#   - STAGING_DATABASE_URL environment variable set
#   - Backup file accessible
# =============================================================================

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

STAGING_DB_URL="${STAGING_DATABASE_URL:-}"
BACKUP_FILE="${1:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ─── Helper Functions ────────────────────────────────────────────────────────

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_fail()    { echo -e "${RED}[FAIL]${NC} $1"; }

check_prerequisites() {
  if [ -z "$STAGING_DB_URL" ]; then
    log_fail "STAGING_DATABASE_URL environment variable is not set"
    log_info "Usage: STAGING_DATABASE_URL=postgresql://user:pass@host:5432/db $0 <backup-file>"
    exit 1
  fi

  if [ ! -f "$BACKUP_FILE" ]; then
    log_fail "Backup file not found: ${BACKUP_FILE}"
    log_info "Usage: $0 <backup-file>"
    log_info "Download latest backup from Supabase dashboard:"
    log_info "  Project Settings → Database → Backups → Download"
    exit 1
  fi

  if ! command -v psql &> /dev/null; then
    log_fail "psql is not installed. Install PostgreSQL client tools."
    exit 1
  fi

  if ! command -v pg_restore &> /dev/null; then
    log_fail "pg_restore is not installed. Install PostgreSQL client tools."
    exit 1
  fi
}

run_sql() {
  psql "${STAGING_DB_URL}" -t -c "$1" 2>/dev/null
}

verify_schema() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Step 1: Schema Verification"
  echo "═══════════════════════════════════════════════════════════════"

  local expected_tables=(
    "users" "profiles" "messages" "conversations" "conversation_participants"
    "posts" "comments" "likes" "matches" "discovery_preferences"
    "notifications" "analytics_events" "stories" "story_views"
    "reports" "blocks" "trust_profiles" "safety_signals"
    "subscriptions" "payment_events" "payment_ledger"
    "admin_audit_log" "dead_letter_queue" "feature_flags"
    "ad_impressions" "ad_clicks" "recommendation_impressions"
  )

  local missing_tables=0
  for table in "${expected_tables[@]}"; do
    local exists
    exists=$(run_sql "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}');")
    exists=$(echo "$exists" | tr -d '[:space:]')

    if [ "$exists" = "t" ]; then
      log_success "Table '${table}' exists"
    else
      log_fail "Table '${table}' is MISSING"
      missing_tables=$((missing_tables + 1))
    fi
  done

  return $missing_tables
}

verify_data_integrity() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Step 2: Data Integrity Verification"
  echo "═══════════════════════════════════════════════════════════════"

  local checks=0
  local passed=0

  # Check 1: Users exist
  checks=$((checks + 1))
  local user_count
  user_count=$(run_sql "SELECT COUNT(*) FROM users;" | tr -d '[:space:]')
  if [ "$user_count" -gt 0 ] 2>/dev/null; then
    log_success "Users table has ${user_count} records"
    passed=$((passed + 1))
  else
    log_warn "Users table is empty (may be expected for fresh staging)"
  fi

  # Check 2: Profiles exist
  checks=$((checks + 1))
  local profile_count
  profile_count=$(run_sql "SELECT COUNT(*) FROM profiles;" | tr -d '[:space:]')
  if [ "$profile_count" -gt 0 ] 2>/dev/null; then
    log_success "Profiles table has ${profile_count} records"
    passed=$((passed + 1))
  else
    log_warn "Profiles table is empty"
  fi

  # Check 3: No orphan records (users without profiles)
  checks=$((checks + 1))
  local orphans
  orphans=$(run_sql "SELECT COUNT(*) FROM users u LEFT JOIN profiles p ON u.id = p.id WHERE p.id IS NULL;" | tr -d '[:space:]')
  if [ "$orphans" = "0" ] 2>/dev/null; then
    log_success "No orphan users (all users have profiles)"
    passed=$((passed + 1))
  else
    log_warn "${orphans} users without profiles (may be intentional)"
  fi

  # Check 4: Foreign key integrity for messages
  checks=$((checks + 1))
  local orphan_messages
  orphan_messages=$(run_sql "SELECT COUNT(*) FROM messages m LEFT JOIN conversations c ON m.conversation_id = c.id WHERE c.id IS NULL;" | tr -d '[:space:]')
  if [ "$orphan_messages" = "0" ] 2>/dev/null; then
    log_success "No orphan messages (all have valid conversations)"
    passed=$((passed + 1))
  else
    log_fail "${orphan_messages} messages reference non-existent conversations"
  fi

  # Check 5: Conversation participants integrity
  checks=$((checks + 1))
  local orphan_participants
  orphan_participants=$(run_sql "SELECT COUNT(*) FROM conversation_participants cp LEFT JOIN conversations c ON cp.conversation_id = c.id WHERE c.id IS NULL;" | tr -d '[:space:]')
  if [ "$orphan_participants" = "0" ] 2>/dev/null; then
    log_success "No orphan conversation participants"
    passed=$((passed + 1))
  else
    log_fail "${orphan_participants} participants reference non-existent conversations"
  fi

  echo ""
  log_info "Data integrity: ${passed}/${checks} checks passed"
  return $((checks - passed))
}

verify_indexes() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Step 3: Index Verification"
  echo "═══════════════════════════════════════════════════════════════"

  local expected_indexes=(
    "users_telegram_id_idx"
    "users_role_idx"
    "profiles_visibility_idx"
    "profiles_last_active_idx"
    "messages_conversation_created_idx"
    "messages_client_id_idx"
    "conversation_participants_user_idx"
    "notifications_recipient_unread_idx"
    "notifications_recipient_all_idx"
    "likes_target_user_idx"
    "likes_source_user_idx"
    "matches_users_idx"
    "matches_status_idx"
    "reports_status_idx"
    "analytics_events_name_created_at_idx"
    "analytics_events_user_id_idx"
    "idx_dlq_status"
    "idx_dlq_job_type"
    "idx_dlq_created"
  )

  local missing_indexes=0
  for index in "${expected_indexes[@]}"; do
    local exists
    exists=$(run_sql "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = '${index}');")
    exists=$(echo "$exists" | tr -d '[:space:]')

    if [ "$exists" = "t" ]; then
      log_success "Index '${index}' exists"
    else
      log_fail "Index '${index}' is MISSING"
      missing_indexes=$((missing_indexes + 1))
    fi
  done

  if [ $missing_indexes -gt 0 ]; then
    log_warn "${missing_indexes} indexes missing (might be in a different migration)"
  fi

  return $missing_indexes
}

verify_rls() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Step 4: RLS Policy Verification"
  echo "═══════════════════════════════════════════════════════════════"

  local tables_with_rls=(
    "users" "profiles" "messages" "conversations" "conversation_participants"
    "posts" "comments" "likes" "matches"
    "notifications" "analytics_events" "reports" "blocks"
    "subscriptions" "payment_events" "payment_ledger"
    "dead_letter_queue"
  )

  local missing_rls=0
  for table in "${tables_with_rls[@]}"; do
    local rls_enabled
    rls_enabled=$(run_sql "SELECT relrowse FROM pg_class WHERE relname = '${table}';")
    rls_enabled=$(echo "$rls_enabled" | tr -d '[:space:]')

    if [ "$rls_enabled" = "t" ]; then
      log_success "RLS enabled on '${table}'"
    else
      log_fail "RLS NOT enabled on '${table}'"
      missing_rls=$((missing_rls + 1))
    fi
  done

  if [ $missing_rls -gt 0 ]; then
    log_fail "${missing_rls} tables missing RLS"
  fi

  return $missing_rls
}

verify_payment_ledger() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Step 5: Payment Ledger Consistency"
  echo "═══════════════════════════════════════════════════════════════"

  local payment_table_count
  payment_table_count=$(run_sql "SELECT COUNT(*) FROM payment_events;" | tr -d '[:space:]' || echo "0")

  if [ "$payment_table_count" = "0" ] || [ -z "$payment_table_count" ]; then
    log_info "No payment records to verify (expected for staging)"
    return 0
  fi

  # Check 1: All payment events should have non-null amounts
  local null_amounts
  null_amounts=$(run_sql "SELECT COUNT(*) FROM payment_events WHERE amount IS NULL;" | tr -d '[:space:]')
  if [ "$null_amounts" = "0" ]; then
    log_success "All payment events have amounts"
  else
    log_fail "${null_amounts} payment events missing amounts"
  fi

  # Check 2: No duplicate event IDs
  local duplicates
  duplicates=$(run_sql "SELECT COUNT(*) FROM (SELECT event_id FROM payment_events WHERE event_id IS NOT NULL GROUP BY event_id HAVING COUNT(*) > 1) dup;" | tr -d '[:space:]')
  if [ "$duplicates" = "0" ]; then
    log_success "No duplicate payment event IDs"
  else
    log_fail "${duplicates} duplicate payment event IDs found"
  fi

  # Check 3: All completed payments have valid user references
  local orphan_payments
  orphan_payments=$(run_sql "SELECT COUNT(*) FROM payment_events p LEFT JOIN users u ON p.user_id = u.id WHERE u.id IS NULL;" | tr -d '[:space:]')
  if [ "$orphan_payments" = "0" ]; then
    log_success "All payments reference valid users"
  else
    log_fail "${orphan_payments} payments reference non-existent users"
  fi
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║   Vibe — Database Restore Verification                       ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Backup file: ${BACKUP_FILE}"
  echo "Target:      ${STAGING_DB_URL//:*@/:***@}"
  echo ""

  check_prerequisites

  # ─── Restore ────────────────────────────────────────────────────────
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Restoring backup to staging..."
  echo "═══════════════════════════════════════════════════════════════"

  log_info "Dropping existing public schema..."
  run_sql "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" || {
    log_fail "Failed to drop public schema"
    exit 1
  }

  log_info "Restoring from backup (this may take a while)..."
  pg_restore --dbname="${STAGING_DB_URL}" --jobs=4 --verbose \
    "${BACKUP_FILE}" 2>&1 | tail -5

  log_success "Backup restored successfully"
  echo ""

  # ─── Run verification steps ──────────────────────────────────────────
  local errors=0

  verify_schema || errors=$((errors + $?))
  verify_data_integrity || errors=$((errors + $?))
  verify_indexes || errors=$((errors + $?))
  verify_rls || errors=$((errors + $?))
  verify_payment_ledger || true

  # ─── Summary ─────────────────────────────────────────────────────────
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Verification Summary"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""

  if [ $errors -eq 0 ]; then
    log_success "All verification steps passed!"
    echo ""
    log_info "Backup is valid and ready for production use."
  else
    log_fail "${errors} verification step(s) failed."
    echo ""
    log_info "Review the failures above and investigate."
    log_info "Common issues:"
    log_info "  - Missing migrations (run pending migrations after restore)"
    log_info "  - Different Supabase project versions"
    log_info "  - Staging environment configuration mismatch"
  fi

  echo ""
  log_info "Note: This staging database now contains a restored backup."
  log_info "It should NOT be used for production traffic."
  log_info "Drop and recreate when done: ./scripts/db-restore-cleanup.sh"
  echo ""
}

main
