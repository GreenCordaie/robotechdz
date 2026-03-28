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

        // You can add more worker initializations here
    }
}
