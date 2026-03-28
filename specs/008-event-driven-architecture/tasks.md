# Tasks: Event-Driven Architecture (Phase 2)

## 1. Foundation
- [x] Create `src/lib/events.ts` (EventBus singleton).
- [x] Define core event types (`TICKET_PRINTED`, `DEBT_PAYMENT_RECORDED`, `ORDER_CREATED`).

## 2. Decoupling
- [x] Update `src/app/admin/clients/actions.ts`:
  - [x] emit `DEBT_PAYMENT_RECORDED` instead of calling `triggerDebtPaymentNotification`.
- [x] Update `src/app/kiosk/actions.ts`:
  - [x] emit `ORDER_CREATED` instead of synchronous notifications.
- [x] Update `/api/print-queue` handling:
  - [x] emit `TICKET_PRINTED` when queue status is updated to `printed`.

## 3. Background Workers
- [ ] Create `src/workers/base.worker.ts` for retry logic.
- [x] Create `src/workers/notification.worker.ts`:
  - [x] Listen to `DEBT_PAYMENT_RECORDED` and `ORDER_CREATED`.
- [x] Implement a "Startup Hook" in Next.js via `src/instrumentation.ts`.
- [x] Enable `instrumentationHook` in `next.config.mjs`.

## 4. Verification
- [ ] Verify instant API response for debt payment.
- [ ] Verify instant API response for kiosk order.
- [ ] Verify Telegram/WhatsApp arrive asynchronously.
