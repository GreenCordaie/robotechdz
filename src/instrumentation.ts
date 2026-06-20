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

        if (!globalAny.__iptvReconcilerScheduled) {
            globalAny.__iptvReconcilerScheduled = true;
            const runIptvReconcile = async () => {
                try {
                    const { reconcilePendingIptvOrders, markExpiredIptvOrders } = await import(
                        './services/iptv-reseller-reconciler.service'
                    );
                    const r = await reconcilePendingIptvOrders({ limit: 100 });
                    if (r.delivered > 0 || r.refunded > 0 || r.errors.length > 0) {
                        console.log('[IptvReconciler]', JSON.stringify(r));
                    }
                    // Persist EXPIRED on mirror rows whose expiresAt is in the past
                    // so listings/exports don't depend on the display layer.
                    const e = await markExpiredIptvOrders({ limit: 500 });
                    if (e.expired > 0) {
                        console.log('[IptvExpiry]', JSON.stringify(e));
                    }
                } catch (e: any) {
                    console.error('[IptvReconciler] error:', e?.message);
                }
            };
            // Stagger 30s off the g2bulk cycle so they don't pile up.
            setTimeout(runIptvReconcile, 50_000);
            setInterval(runIptvReconcile, 60_000);
            console.log('[IptvReconciler] scheduled every 60s (offset +30s)');
        }

        // Netflix mirror ↔ LoadBrain reconciler (P2-5). Pull safety-net for missed
        // allocate/release webhooks. Only runs in authoritative mode
        // (LB_NETFLIX_AUTHORITATIVE on); a no-op otherwise and when there are no
        // LB-mirrored slots. Webhooks remain the primary sync path — this is slow
        // (every 5 min) on purpose.
        if (!globalAny.__netflixMirrorReconcilerScheduled) {
            globalAny.__netflixMirrorReconcilerScheduled = true;
            const runNetflixReconcile = async () => {
                try {
                    const { isLbNetflixAuthoritative } = await import('./lib/loadbrain-netflix-flag');
                    if (!(await isLbNetflixAuthoritative())) return;
                    const { reconcileNetflixMirror } = await import('./services/netflix-mirror-reconcile.service');
                    const r = await reconcileNetflixMirror({ batchSize: 500 });
                    if (r.healedToStock > 0 || r.conflicts > 0 || r.orphans > 0) {
                        console.log('[NetflixReconcile]', JSON.stringify(r));
                    }
                } catch (e: any) {
                    console.error('[NetflixReconcile] error:', e?.message);
                }
            };
            // Offset +40s off the iptv cycle; run every 5 min.
            setTimeout(runNetflixReconcile, 70_000);
            setInterval(runNetflixReconcile, 5 * 60_000);
            console.log('[NetflixReconcile] scheduled every 5min (authoritative mode only)');
        }

        // You can add more worker initializations here
    }
}
