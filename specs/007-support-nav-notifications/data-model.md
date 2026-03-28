# Data Model: Support Navigation & Notifications

## New Tables

### `support_conversation_metadata`
Stores metadata for support conversations, primarily for tracking view status.

| Field | Type | Description |
|-------|------|-------------|
| phone | VARCHAR(255) | Canonical phone number (Primary Key) |
| last_seen_at | TIMESTAMP | The last time an admin viewed this conversation |

## Existing Tables Used

### `webhookEvents`
Used to fetch incoming and outgoing WhatsApp messages. Combined with `last_seen_at` to determine the `unreadCount`.

### `clients`
Used to resolve canonical phone numbers from WhatsApp identifiers (LIDs).
