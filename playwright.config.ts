import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 30_000,
    expect: { timeout: 8_000 },
    fullyParallel: false, // les tests partagent une DB seedée, on évite les races
    forbidOnly: !!process.env.CI,
    // CI : 1 retry pour absorber les flakys de cold-compile Next.js dev server
    // sur les pages admin lourdes (Settings, B2B). Local : 0 retry pour révéler
    // tout de suite les vraies régressions.
    retries: process.env.CI ? 1 : 0,
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
    // Note : pas de playwright.webServer — on assume que le dev server est
    // déjà démarré externellement (par CI workflow ou en local manuel).
});
