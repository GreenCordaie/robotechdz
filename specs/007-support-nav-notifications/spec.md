# Spec: Support Navigation & Notifications

## Goal
Improve the administrator experience when handling customer support by enabling seamless navigation from tickets to conversations and ensuring that notifications are cleared appropriately when a conversation is viewed.

## Context
The previous implementation required administrators to manually switch views and find the customer in the conversation list after identifying an issue in the ticket list. Additionally, the notification dot for open tickets persisted even after the admin had read all messages, leading to confusion about which conversations required attention.

## Requirements
- Link "Ouvrir Conversation" button to the unified support chat.
- Implement persistent tracking of "Last Seen" per conversation.
- Display real-time unread counts in the conversation sidebar.
- Automatically clear notifications upon viewing a conversation.
- Clear unread status when a ticket is resolved.

## Design Decisions
- Use a metadata table `support_conversation_metadata` to track `last_seen_at` for each canonical phone.
- Resolve canonical phone from WhatsApp LIDs/IDs using the `clients` and `webhookEvents` tables.
- Lift the `selectedPhone` state in `SupportContent.tsx` to allow cross-view selection.
- Update `markConversationAsReadAction` to trigger a re-fetch of the conversation list.
