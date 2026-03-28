# Implementation Plan: Support Navigation & Notifications

## Database Changes
- [x] Create table `support_conversation_metadata` (phone VARCHAR PRIMARY KEY, last_seen_at TIMESTAMP).

## Server Actions
- [x] Update `getConversationsAction` to join with `support_conversation_metadata` and calculate `unreadCount`.
- [x] Refine `markConversationAsReadAction` to upsert into `support_conversation_metadata`.
- [x] Update `updateTicketStatus` to mark conversation as read when resolved.

## Frontend Components
- [x] Lift state in `SupportContent.tsx`: `selectedPhone` and `setSelectedPhone`.
- [x] Pass `selectedPhone` to `SupportConversationView`.
- [x] Update button in Ticket Card from "Voir Commande" to "Ouvrir Conversation".
- [x] Use `unreadCount` in `DiscussionList.tsx` to show numeric badges.
- [x] Fix infinite re-render in `SupportContent.tsx` by using `useRef` for polling guard.

## Verification
- [ ] Verify unread badge disappears when chat is opened.
- [ ] Verify "Ouvrir Conversation" correctly switches view and selects client.
- [ ] Verify ticket resolution clears notifications.
