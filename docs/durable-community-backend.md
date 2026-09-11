# Durable community backend design

Status: proposed / approval required before implementation
Issue: #46
Depends on: PR #48 (`CommunityStore` write-integrity hardening) or equivalent behavior on `main`

## Decision

Use **Cloud Firestore Standard edition** as the durable backend for community data while keeping the existing Express/Node API surface.

Do not move this feature to Cloudflare D1 at this stage. D1 would require re-platforming the current Express server to Workers (or introducing an additional service boundary), which is larger than the persistence problem being solved. Do not use Cloud SQL/Postgres for the first durable version: connection management, migrations, instance lifecycle, and baseline operational cost are disproportionate to the current workload.

Firestore is selected because the current server is already structured as a Node/Express process intended for a managed container environment such as Cloud Run, and Firestore provides server-side transactions suitable for concurrent review/vote mutations without requiring a separate database server.

Use the **default Firestore database, Standard edition**, in the same region as the production compute service. The actual region is a deployment decision and must be confirmed before database creation; do not infer it from local development settings. A named database is not required.

## Non-goals

- No production database creation or deployment in this change.
- No migration execution in this change.
- No API response-shape change.
- No public API path change.
- No user-facing account/authentication system.
- No Firestore Web SDK or direct browser access. All Firestore access stays server-side.
- No TTL dependency for correctness.

## Required application boundary

Introduce a storage interface that preserves the existing `CommunityStore` behavior. The HTTP router must depend on the interface, not on the JSON implementation.

Conceptual interface:

```ts
interface CommunityRepository {
  getToilets(): Promise<ToiletFacility[]>;
  getExternalReviews(): Promise<Record<string, ToiletReview[]>>;
  addToilet(t: ToiletFacility): Promise<{ added: boolean }>;
  addReview(facilityId: string, input: ReviewInput, ipHash: string): Promise<AddReviewResult>;
  voteHelpful(reviewId: string, ipHash: string): Promise<HelpfulVoteResult>;
  addReport(toiletId: string, reviewId: string, reason: string): Promise<ReportResult>;
  registerExternalFacilities?(facilities: ExternalFacilityObservation[]): Promise<void>;
  isKnownExternalFacility?(facilityId: string): Promise<boolean>;
}
```

`JsonCommunityStore` remains available for local development, migration verification, and emergency rollback. `FirestoreCommunityStore` becomes the production candidate only after migration verification and explicit cutover approval.

Backend selection must be explicit:

```text
COMMUNITY_BACKEND=json|firestore
```

Default in development/test: `json`.
Production must fail fast if the configured backend cannot initialize.

## Firestore data model

Use normalized documents rather than storing the entire current JSON database in a single Firestore document. A single-document port would recreate a contention hotspot and approach Firestore document-size limits as community content grows.

### `community_toilets/{facilityId}`

Stores only community-created facility metadata.

Suggested fields:

- `id`
- `name`
- `facilityType`
- `category`
- `dataSource = "community"`
- `lat`, `lng`
- `address`, `floorInfo`
- `attributes`
- `description`
- derived score fields used by the current API (`cleanlinessScore`, `cleanlinessGrade`, `overallScore`, `reviewCount`, `lastCleaned`)
- `createdAt`, `updatedAt`

Do not embed the complete review array in this document.

### `reviews/{reviewId}`

Top-level collection so votes, reports, moderation, migration, and cross-facility maintenance can address a review directly.

Fields:

- `id`
- `facilityId`
- `facilityKind: "community" | "external"`
- `userName`
- `overallScore`
- `cleanlinessScore`
- `odorScore`
- `suppliesScore`
- `comment`
- `helpfulCount`
- `createdAt`

The required query is primarily `facilityId == X` ordered by `createdAt` descending. Avoid indexing long text fields such as `comment` where Firestore configuration permits it.

### `facility_aggregates/{facilityId}`

Stores transactionally maintained score inputs so adding one review does not require scanning every historical review.

Fields:

- `facilityId`
- `reviewCount`
- `sumOverall`
- `sumCleanliness`
- `sumOdor`
- `sumSupplies`
- `updatedAt`

Derived averages/grade returned by the API must be calculated from these exact sums using the same rounding and `gradeForScore` semantics as the JSON implementation.

For community facilities, `community_toilets` may duplicate the derived display fields for efficient list reads, but `facility_aggregates` is the transactional source for aggregate inputs. Both documents must be updated in the same review transaction.

For external facilities, the aggregate document avoids rescanning all external reviews after every post.

Migration and moderation must maintain these sums exactly. Removing a review must decrement the aggregate in the same transaction that deletes the review and its related vote/dedup state.

### `review_dedup/{dedupKey}`

Enforces the current 24-hour duplicate-review guard without scanning every review.

`dedupKey = sha256(facilityId + "|" + ipHash + "|" + normalizedComment)`

`normalizedComment = trim(comment) + collapse whitespace runs to a single ASCII space + lowercase` — the same rule the JSON backend has always used for its 24h duplicate guard (`server/shared/dedup.ts` is the single shared implementation; never re-derive the key elsewhere). The review pipeline sanitizes comments before this point, so normalization only ever collapses cosmetic case/whitespace variants.

Fields:

- `facilityId`
- `ipHash`
- `reviewId`
- `commentHash`
- `createdAt`
- `validUntil`

Correctness must use `validUntil` in the transaction; Firestore TTL may later be used only for cleanup, never as the correctness mechanism.

### `helpful_votes/{voteKey}`

`voteKey = sha256(reviewId + "|" + ipHash)`

Fields:

- `reviewId`
- `ipHash`
- `createdAt`

Creating this document and incrementing `reviews/{reviewId}.helpfulCount` must occur in one Firestore transaction. If the vote document already exists, return `voted: false` without incrementing.

### `reports/{reportId}`

Fields:

- `id`
- `facilityId`
- `reviewId`
- `reason`
- `createdAt`
- optional future moderation fields (`status`, `resolvedAt`, `resolution`) must not be required for the first migration.

### `external_facilities/{facilityId}`

Durable registry of external facility IDs. This is intentionally included because PR #48 identified that an in-memory registry loses live OSM observations after process restart.

Fields:

- `id`
- `source: "osm" | "google" | "od"`
- `firstSeenAt`
- `origin: "static-seed" | "live-osm" | "migration"`
- optional `legacyId`
- optional `lastSeenAt`

For static OSM seed rows, register the exact canonical typed ID from `officialOpenDataId`. Do not register all possible `node/way/relation` aliases for a legacy numeric OSM ID.

`lastSeenAt` is not required for correctness and must not be updated on every map/OSM request. Registry writes should be create-if-absent (or explicitly throttled) to avoid turning read traffic into Firestore write amplification.

## Transaction boundaries

Firestore transaction callbacks may retry. They must be free of external side effects and must not mutate application state outside the transaction result.

### Add community facility

Transaction:

1. Read `community_toilets/{facilityId}`.
2. If present, return duplicate.
3. Create facility document.
4. Create zeroed `facility_aggregates/{facilityId}`.

### Add review to community facility

Transaction:

1. Read facility document.
2. Read `facility_aggregates/{facilityId}`.
3. Read deterministic `review_dedup/{dedupKey}`.
4. If a non-expired dedup document exists, return duplicate.
5. Create `reviews/{reviewId}`.
6. Create/replace dedup document.
7. Increment aggregate sums/count.
8. Recompute derived score fields from the new sums and update `community_toilets/{facilityId}`.

No historical review query is needed on the normal write path.

### Add review to external facility

Transaction:

1. Read `external_facilities/{facilityId}` and reject if absent.
2. Read `facility_aggregates/{facilityId}` (treat absent as zero only for a known external facility).
3. Read `review_dedup/{dedupKey}`.
4. If non-expired duplicate exists, return duplicate.
5. Create review and dedup documents.
6. Create/update aggregate sums atomically.

Unknown syntactically valid IDs remain 404.

### Helpful vote

Transaction:

1. Read review.
2. Read deterministic vote document.
3. If review absent: not found.
4. If vote exists: return current count with `voted: false`.
5. Create vote document and increment helpful count atomically.

### Report

Use a transaction, not a preflight read followed by an unrelated create:

1. Read `reviews/{reviewId}`.
2. Verify it exists and its `facilityId` equals the supplied facility ID.
3. Create `reports/{reportId}` in the same transaction.

This prevents a report from being created for a review that was concurrently removed between validation and write.

### Moderation removal

A Firestore-backed moderation operation must atomically maintain referential and aggregate state:

1. Read review and aggregate.
2. Delete review.
3. Decrement aggregate count/sums and update community derived fields when applicable.
4. Delete known dedup guard for that review when addressable.
5. Delete related reports and helpful votes via bounded follow-up batches/transactions with a resumable operation if fan-out exceeds one transaction.

The first Firestore implementation must document how partial fan-out cleanup resumes safely; it must not silently leave aggregate corruption.

## Authentication and permissions

The browser must not receive Firestore credentials. The Express server uses the Google Cloud server client through Application Default Credentials / workload identity provided by the runtime.

The production service identity should receive only the minimum Firestore permissions required by this service. IAM changes are deployment operations and require explicit approval.

## Migration plan

Migration is deliberately separated from implementation.

### Phase 0: prerequisites

- PR #48 or equivalent write-integrity behavior merged.
- `main` CI green.
- Production compute project and region confirmed.
- Firestore Standard/default database choice explicitly approved.
- Service identity / IAM plan explicitly approved.
- Current `data/community.json` exported and checksum recorded.

### Phase 1: implementation with no production cutover

Add:

- repository interface
- `JsonCommunityStore` adapter around current behavior
- `FirestoreCommunityStore`
- backend factory using `COMMUNITY_BACKEND`
- migration CLI with `--dry-run` as default
- reverse-export CLI
- parity verifier
- Firestore emulator tests

Production remains on `COMMUNITY_BACKEND=json`.

### Phase 2: migration dry run

The migration CLI reads a frozen JSON snapshot and validates:

- schema/version
- unique facility IDs
- unique review IDs
- review-to-facility relationships
- helpful vote references
- report references
- duplicate-guard references
- external facility IDs and typed OSM aliases
- aggregate sums/counts recomputed from reviews

Print counts and a deterministic digest. No writes unless `--apply` is explicitly provided.

### Phase 3: staging/emulator import

Import into a non-production emulator/test database and run parity checks:

- facility count
- review count per facility
- external review count per facility
- report count
- helpful vote cardinality
- aggregate sums/counts
- derived score/count parity
- external facility registry parity
- API contract tests against JSON and Firestore implementations

### Phase 4: production cutover (explicit approval required)

Use a short write freeze to avoid divergence during the initial migration.

1. Export current JSON and record SHA-256 + counts.
2. Temporarily reject community write endpoints with a maintenance response while reads remain available.
3. Import snapshot to Firestore idempotently.
4. Run parity verifier against production Firestore.
5. Change `COMMUNITY_BACKEND=firestore` and deploy one revision.
6. Run smoke tests for read, review, vote, and report paths.
7. Re-enable writes only after parity and smoke checks pass.

Do not dual-write JSON and Firestore during the first cutover. Dual-write introduces its own partial-failure and reconciliation problem and is unnecessary for the current traffic level.

## Rollback

### Before writes are re-enabled

Rollback is simple: set `COMMUNITY_BACKEND=json` and redeploy the previous known-good revision. No data reconciliation is needed because the frozen JSON snapshot remains authoritative.

### After Firestore has accepted new writes

Do **not** blindly switch back to stale JSON.

Required rollback sequence:

1. Freeze community writes.
2. Export Firestore into the JSON-compatible snapshot format.
3. Verify counts, referential integrity, aggregates, and digest.
4. Store a backup of the pre-cutover JSON snapshot separately.
5. Replace the rollback JSON snapshot only after verification.
6. Switch backend to JSON and redeploy.
7. Smoke test and then re-enable writes.

If reverse export/parity fails, keep Firestore active and treat rollback as blocked rather than discarding accepted user writes.

## Test gates

Implementation is not complete until all of the following pass:

- existing unit tests
- TypeScript check
- production build
- JSON backend regression suite
- Firestore emulator suite
- API contract suite run against both backends
- concurrent review creation test
- same-IP duplicate review test
- concurrent duplicate helpful-vote test
- transaction retry test proving callback side-effect safety
- partial-failure test proving no half-written review/vote/aggregate state
- report-vs-review-delete race test
- restart persistence test
- external facility create-if-absent/throttling test
- migration dry-run test
- migration idempotency test
- JSON -> Firestore parity test including aggregate sums
- Firestore -> JSON rollback-export parity test

No test may rely on production Firestore.

## Cost and scale assumptions

Firestore Standard has a free quota suitable for an early low-traffic deployment, but quota and pricing are operational inputs rather than correctness assumptions. The application must remain correct after exceeding free quota and must surface backend errors instead of silently falling back to local server state.

Before production cutover, configure budget/usage monitoring separately. Billing configuration is outside this design PR and requires explicit approval.

## Alternatives considered

### Cloudflare D1

Advantages: inexpensive SQLite-like durable storage and good fit if the whole application is moved to Workers.

Rejected for this step because the current runtime is Express/Node with server-side OSM proxy behavior. Adopting D1 would couple persistence migration to a runtime re-platform, expanding blast radius and test scope.

### Cloud SQL / Postgres

Advantages: relational constraints, mature SQL migration tooling, strong fit for larger analytical/query workloads.

Rejected for the first durable version because instance/network/connection-pool/migration operations are heavier than necessary for the current workload. Reconsider if query complexity, reporting, or sustained write volume outgrows Firestore.

### Persistent volume + JSON

Advantages: minimal application change.

Rejected as the durable target because it preserves a single-writer/single-replica architectural constraint and does not solve horizontal scaling. It remains acceptable only as an explicitly documented temporary single-replica deployment mode.

## Approval gate

Implementation must not start until the following are explicitly approved:

1. Firestore Standard as the backend.
2. Default database and deployment region (same region as production compute).
3. The normalized schema above, including `facility_aggregates` and durable `external_facilities`.
4. Short write-freeze migration instead of initial dual-write.
5. Rollback behavior after post-cutover writes.

Database creation, IAM changes, migration execution, production environment changes, deployment, Ready transition, and merge remain separate high-risk actions.
