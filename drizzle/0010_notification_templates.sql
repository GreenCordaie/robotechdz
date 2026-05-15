-- EPIC 1 / Phase L — Templates de notifications configurables par l'admin.

CREATE TABLE IF NOT EXISTS "notification_templates" (
    "event_key" TEXT PRIMARY KEY,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_by_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL
);
