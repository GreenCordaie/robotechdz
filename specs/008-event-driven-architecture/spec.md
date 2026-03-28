# Spec: Event-Driven Architecture (Phase 2 - Core)

## Goal
Decouple critical API operations (Printing, Payment Validation) from slow external services (n8n, CRM, WhatsApp) to guarantee sub-second response times and prevent blocking the UI.

## Problem Statement
The current system executes CRM sync and WhatsApp notifications sequentially within the Next.js Server Actions. If n8n or the WhatsApp API is slow or unreachable, it delays the `recordPayment` or `payOrder` response, frustrating the user and potentially leading to duplicate submissions.

## Proposed Solution
1. **Internal Event Bus**: Implement a singleton `EventBus` (based on Node.js `EventEmitter`) to publish events like `TICKET_PRINTED`, `PAYMENT_RECORDED`.
2. **Background Workers**: Create async listeners that subscribe to these events and perform the heavy lifting (n8n triggers, Waha API calls) out-of-band.
3. **Optimistic API**: API actions will only perform DB updates and emit events, returning immediately to the client.

## Components
- `src/lib/events.ts`: Core event bus implementation.
- `src/workers/notification.worker.ts`: A module that listens for events and handles external communications.
- `src/services/order.service.ts`: First step towards DDD by moving logic out of actions.

## Success Criteria
- [ ] API Response time for `recordPayment` is $<200ms$.
- [ ] WhatsApp notifications are sent even if the API response has already completed.
- [ ] No core logic depends on the availability of n8n.
