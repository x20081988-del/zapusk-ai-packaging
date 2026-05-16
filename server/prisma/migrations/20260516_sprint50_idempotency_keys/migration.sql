-- Sprint 50 P0.1 — idempotency keys table. Additive: no existing data is
-- touched, no FK on user or project (the middleware just looks the row up
-- by composite key). expiresAt index lets a future cleaner job purge in
-- one indexed scan.
CREATE TABLE "IdempotencyKey" (
  "id"           TEXT PRIMARY KEY,
  "key"          TEXT NOT NULL,
  "actorId"      TEXT NOT NULL,
  "route"        TEXT NOT NULL,
  "requestHash"  TEXT NOT NULL,
  "responseJson" TEXT NOT NULL,
  "statusCode"   INTEGER NOT NULL,
  "expiresAt"    DATETIME NOT NULL,
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "IdempotencyKey_key_actor_route_unique"
  ON "IdempotencyKey"("key", "actorId", "route");

CREATE INDEX "IdempotencyKey_expiresAt_idx"
  ON "IdempotencyKey"("expiresAt");
