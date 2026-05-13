import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 30_000,
    expect: { timeout: 8_000 },
    fullyParallel: false, // les tests partagent une DB seedée, on évite les races
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
    use: {
        baseURL: "http://localhost:4555",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
        actionTimeout: 10_000,
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        // Le dev server est démarré par scripts/test-e2e.sh AVANT playwright,
        // ici on dit juste à Playwright qu'il doit déjà être up.
        command: "echo 'dev server should be already running on :3000'",
        url: "http://localhost:4555",
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
