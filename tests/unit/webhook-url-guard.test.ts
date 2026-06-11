import { describe, it, expect } from "vitest";
import { isBlockedWebhookUrl } from "@/lib/webhook-url-guard";

describe("isBlockedWebhookUrl", () => {
    it("allows legitimate public https URLs", () => {
        expect(isBlockedWebhookUrl("https://hooks.example.com/abc")).toBe(false);
        expect(isBlockedWebhookUrl("http://api.partner.io:8443/webhook")).toBe(false);
        expect(isBlockedWebhookUrl("https://my-shop-123.vercel.app/cb")).toBe(false);
    });

    it("blocks non-http(s) schemes", () => {
        expect(isBlockedWebhookUrl("ftp://example.com/")).toBe(true);
        expect(isBlockedWebhookUrl("file:///etc/passwd")).toBe(true);
        expect(isBlockedWebhookUrl("gopher://example.com/")).toBe(true);
    });

    it("blocks unparseable input", () => {
        expect(isBlockedWebhookUrl("not a url")).toBe(true);
        expect(isBlockedWebhookUrl("")).toBe(true);
    });

    it("blocks localhost and special TLDs", () => {
        expect(isBlockedWebhookUrl("http://localhost/")).toBe(true);
        expect(isBlockedWebhookUrl("http://localhost:3000/x")).toBe(true);
        expect(isBlockedWebhookUrl("http://api.localhost/x")).toBe(true);
        expect(isBlockedWebhookUrl("http://printer.local/x")).toBe(true);
        expect(isBlockedWebhookUrl("https://vault.internal/x")).toBe(true);
    });

    it("blocks dotted IPv4 loopback / private / link-local ranges", () => {
        expect(isBlockedWebhookUrl("http://127.0.0.1/")).toBe(true);
        expect(isBlockedWebhookUrl("http://10.0.0.5/")).toBe(true);
        expect(isBlockedWebhookUrl("http://172.16.0.1/")).toBe(true);
        expect(isBlockedWebhookUrl("http://172.31.255.255/")).toBe(true);
        expect(isBlockedWebhookUrl("http://192.168.1.1/")).toBe(true);
        expect(isBlockedWebhookUrl("http://169.254.169.254/latest/meta-data/")).toBe(true);
        expect(isBlockedWebhookUrl("http://0.0.0.0/")).toBe(true);
        expect(isBlockedWebhookUrl("http://100.64.0.1/")).toBe(true);
    });

    it("allows public dotted IPv4 (e.g. 172.32 is NOT private)", () => {
        expect(isBlockedWebhookUrl("http://8.8.8.8/")).toBe(false);
        expect(isBlockedWebhookUrl("http://172.32.0.1/")).toBe(false);
    });

    it("blocks IPv6 loopback, link-local, ULA and IPv4-mapped", () => {
        expect(isBlockedWebhookUrl("http://[::1]/")).toBe(true);
        expect(isBlockedWebhookUrl("http://[::1]:8080/internal")).toBe(true);
        expect(isBlockedWebhookUrl("http://[::]/")).toBe(true);
        expect(isBlockedWebhookUrl("http://[fe80::1]/")).toBe(true);
        expect(isBlockedWebhookUrl("http://[fc00::1]/")).toBe(true);
        expect(isBlockedWebhookUrl("http://[fd12:3456::1]/")).toBe(true);
        expect(isBlockedWebhookUrl("http://[::ffff:127.0.0.1]/")).toBe(true);
    });

    it("blocks integer and hex IPv4 obfuscation", () => {
        expect(isBlockedWebhookUrl("http://2130706433/")).toBe(true); // 127.0.0.1
        expect(isBlockedWebhookUrl("http://0x7f000001/")).toBe(true); // 127.0.0.1
    });
});
