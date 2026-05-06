# Offline Authentication and Cache Strategy

This guide explains how to run authentication and core operations when internet connection is lost in an Electron + Go + SQLite architecture.

## 1. Target Architecture

- Electron UI: Presents data and user interactions.
- Go local service: Handles auth, sync, conflict resolution, and event broadcasting.
- SQLite local database: Local source of truth for reads and queued writes.
- Remote backend: Authoritative cloud/server data source.

Recommended model:
- SQLite is used for fast local reads and offline continuity.
- Go service writes to SQLite first, then syncs to backend when online.
- Electron reads from SQLite (or Go API wrapping SQLite) and listens to Go events for updates.

## 2. Offline Modes You Must Differentiate

### A) Local service down (Electron cannot reach Go)

- Show Service Unavailable state in UI.
- Try automatic local Go restart.
- Allow limited read-only UI directly from SQLite if possible.
- Block sensitive writes until Go returns.

### B) Internet down (Go alive, backend unreachable)

- Enter Offline Mode.
- Continue allowed local operations.
- Save writes locally and queue for sync.

## 3. Cache-Based Offline Authentication

## 3.1 First login must be online

On first successful online login:
- Verify credentials with remote backend.
- Store offline auth cache in SQLite:
  - user_id
  - username
  - password verifier hash (never plain password)
  - role snapshot
  - permission snapshot
  - token/session metadata
  - offline_expiry_at
  - last_online_auth_at
  - device_id binding

## 3.2 Later offline login flow

When internet is unavailable:
- Check if user exists in local auth cache.
- Validate password/PIN against stored verifier hash.
- Confirm device_id matches current machine.
- Confirm offline_expiry_at is not exceeded.
- Enforce lockout/rate-limit policy.

If all checks pass, create an offline session.

## 3.3 Offline login restrictions

- No first-time user onboarding offline.
- No password reset offline.
- No role or permission elevation offline.
- No disabled/revoked-user bypass after expiry.

## 3.4 Re-auth policy

- Define max offline auth duration (example: 8 to 24 hours).
- After expiry, force online login.
- On reconnect, run revocation checks and refresh permission cache.

## 4. SQLite Tables (Suggested)

## 4.1 auth_cache

Fields:
- user_id (PK)
- username
- password_hash
- password_hash_algo
- role_version
- permissions_json
- device_id
- last_online_auth_at
- offline_expiry_at
- failed_attempts
- locked_until
- updated_at

## 4.2 session_state

Fields:
- session_id (PK)
- user_id
- mode (online/offline)
- issued_at
- expires_at
- last_activity_at

## 4.3 outbox_events

Fields:
- event_id (PK)
- entity_type
- entity_id
- operation (create/update/delete)
- payload_json
- idempotency_key
- local_created_at
- sync_status (pending/sent/acked/failed)
- retry_count
- last_error

## 4.4 sync_checkpoint

Fields:
- stream_name
- last_synced_version
- last_synced_at

## 4.5 conflict_queue

Fields:
- conflict_id (PK)
- entity_type
- entity_id
- local_payload_json
- server_payload_json
- resolution_status
- detected_at

## 4.6 audit_log

Fields:
- audit_id (PK)
- user_id
- action
- mode (online/offline)
- payload_json
- created_at

## 5. Login and Session Flows

## 5.1 Online login flow

1. Electron sends credentials to Go.
2. Go validates against backend.
3. Go updates auth_cache and permissions snapshot in SQLite.
4. Go creates session_state.
5. Go notifies Electron: auth success + mode=online.

## 5.2 Offline login flow

1. Electron sends credentials to Go.
2. Go checks internet status.
3. If offline, Go validates using auth_cache.
4. If valid and not expired, Go creates offline session.
5. Go notifies Electron: auth success + mode=offline.

## 5.3 Reconnect flow

1. Go detects internet restored.
2. Go revalidates current user/session against backend.
3. Go refreshes role and permissions snapshot.
4. Go starts outbox sync.
5. Go emits sync progress and completion events.

## 6. Data Update Pattern (Cache + Queue)

For any business write (example: sale, inventory, customer update):

1. Validate action against cached permissions.
2. Write business change to SQLite in a transaction.
3. Insert corresponding row in outbox_events in the same transaction.
4. Emit local event to Electron so UI updates instantly.
5. Background sync worker sends pending events to backend when online.
6. Mark event acked on success.
7. Keep failed events with retries and exponential backoff.

Important rule:
- Do not lose local writes because of temporary network loss.

## 7. Conflict Handling on Reconnect

Use deterministic strategy:
- Low-risk entities: last-write-wins with version/timestamp.
- Critical entities (money, stock, settlements): server-authoritative merge + manual review when needed.

Conflict pipeline:
1. Detect version mismatch.
2. Save conflict in conflict_queue.
3. Flag UI for manager review if auto-merge is unsafe.
4. Resolve and re-queue final event.

## 8. Security Controls for Cached Auth

- Hash secrets with strong KDF (Argon2id preferred; bcrypt acceptable).
- Encrypt sensitive SQLite fields with app key from OS credential store.
- Bind cache to device fingerprint/device_id.
- Rate-limit failed offline attempts and apply lockout.
- Detect suspicious clock rollback attempts.
- Sign critical offline events (HMAC) to detect tampering.
- Keep offline permission policy conservative.

## 9. UI Behavior You Should Implement

Always display current connectivity and auth state:
- Online
- Offline (limited)
- Service unavailable

Show:
- Last successful sync time.
- Pending sync count.
- Disabled actions in offline mode.
- Conflict count when reconnecting.

## 10. Operational Policies to Finalize

Define these with business stakeholders before production:
- Max offline auth duration.
- Which roles can login offline.
- Which actions are allowed offline.
- Max unsynced transaction count.
- Escalation path for unresolved conflicts.
- Audit retention and compliance requirements.

## 11. Minimal Implementation Checklist

- Build auth_cache, session_state, outbox_events tables.
- Add offline login validator in Go.
- Add outbox writer in every write transaction.
- Add sync worker with retry + idempotency.
- Add reconnect revalidation for user/session.
- Add UI mode badges and blocked-action messaging.
- Add audit logging for all offline privileged actions.

## 12. Practical Defaults (Good Starting Point)

- Offline auth TTL: 12 hours.
- Failed offline login lockout: 5 attempts, 15-minute lock.
- Sync retry backoff: 2s, 5s, 10s, 30s, 60s, then every 5m.
- Conflict auto-merge: only for non-financial entities.
- Revalidation trigger: immediate on reconnect + every 30 minutes online.

---

If you want, next step can be a concrete technical spec with:
- exact SQLite DDL,
- Go interface contracts (AuthService, SyncService),
- Electron event names and payload formats.
