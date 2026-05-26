console.log(">> [Instrumentation] File Loaded");

export async function register() {
    console.log(">> [Instrumentation] Registering...");
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { initNotificationWorker } = await import('./workers/notification.worker');
        const { initTasksWorker } = await import('./workers/tasks.worker');

        console.log("--------------------------------------------------");
        console.log("🚀 Initializing ROBOTECHDZ Architecture Phase 2");
        console.log("--------------------------------------------------");

        // 1. Initialize Event Bus listeners
        initNotificationWorker();

        // 2. Initialize Persistent Queue worker
        initTasksWorker();

        // 3. Schedule the shared-account expiration sweeper (every 6h)
        const globalAny = globalThis as any;
        if (!globalAny.__sharedAccountSweeperScheduled) {
            globalAny.__sharedAccountSweeperScheduled = true;
            const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
            const runSweep = async () => {
                try {
                    const { db } = await import('./db');
                    const { sweepExpiredSlots } = await import('./services/shared-account-sweeper.service');
                    const res = await sweepExpiredSlots(db as any);
                    if (res.expired > 0) {
                        console.log(`[Sweeper] shared-account: expired=${res.expired} took_ms=${res.took_ms}`);
                    }
                } catch (e: any) {
                    console.error('[Sweeper] shared-account error:', e?.message);
                }
            };
            // Defer initial run by 30s to avoid blocking boot
            setTimeout(runSweep, 30_000);
            setInterval(runSweep, SIX_HOURS_MS);
            console.log('[Sweeper] shared-account scheduled every 6h');
        }

        // Streaming deeplink mailbox watcher (gated by STREAMING_DEEPLINK_MODE=true)
        try {
            const { initStreamingMailboxWatcher } = await import(
                './workers/streaming-mailbox-watcher.worker'
            );
            initStreamingMailboxWatcher();
        } catch (err: any) {
            console.error('[Instrumentation] streaming watcher init failed:', err?.message);
        }

        if (!globalAny.__g2bulkReconcilerScheduled) {
            globalAny.__g2bulkReconcilerScheduled = true;
            const runReconcile = async () => {
                try {
                    const { reconcilePendingG2BulkOrders } = await import(
                        './services/g2bulk-reconciler.service'
                    );
                    const r = await reconcilePendingG2BulkOrders({ limit: 100 });
                    if (r.delivered > 0 || r.refunded > 0 || r.errors.length > 0) {
                        console.log('[G2BulkReconciler]', JSON.stringify(r));
                    }
                } catch (e: any) {
                    console.error('[G2BulkReconciler] error:', e?.message);
                }
            };
            setTimeout(runReconcile, 20_000);
            setInterval(runReconcile, 60_000);
            console.log('[G2BulkReconciler] scheduled every 60s');
        }

        // You can add more worker initializations here
    }
}
