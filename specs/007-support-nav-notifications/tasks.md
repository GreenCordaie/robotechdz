# Tasks: Support Navigation & Notifications

- [x] Create `support_conversation_metadata` migration.
- [x] Apply migration to database.
- [x] Refactor `getConversations` to include unread counts.
- [x] refactor `markConversationAsRead` to update `last_seen_at`.
- [x] Lift `selectedPhone` state to `SupportContent`.
- [x] Update `SupportConversationView` to handle lifted state.
- [x] Design and implement unread badge in `DiscussionList`.
- [x] Fix infinite re-render loop in `SupportContent`.
- [x] Update ticket card actions to link to conversation.
- [ ] Final verification of end-to-end flow.
