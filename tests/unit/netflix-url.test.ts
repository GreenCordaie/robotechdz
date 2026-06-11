import { describe, it, expect } from "vitest";
import {
    isNetflixHouseholdUrl,
    isNetflixSenderAddress,
} from "@/lib/netflix-url";

describe("isNetflixHouseholdUrl", () => {
    it("accepts a genuine https://www.netflix.com household link", () => {
        expect(
            isNetflixHouseholdUrl(
                "https://www.netflix.com/account/update-household?nftoken=abc",
            ),
        ).toBe(true);
    });

    it("rejects userinfo confusion www.netflix.com@evil.com (real host = evil.com)", () => {
        expect(
            isNetflixHouseholdUrl(
                "https://www.netflix.com@evil.com/update-household",
            ),
        ).toBe(false);
    });

    it("rejects subdomain confusion www.netflix.com.evil.com", () => {
        expect(
            isNetflixHouseholdUrl("https://www.netflix.com.evil.com/verify"),
        ).toBe(false);
    });

    it("rejects a lookalike domain evil-netflix.com", () => {
        expect(
            isNetflixHouseholdUrl("https://www.evil-netflix.com/update-household"),
        ).toBe(false);
    });

    it("rejects non-https schemes", () => {
        expect(isNetflixHouseholdUrl("http://www.netflix.com/verify")).toBe(false);
    });

    it("rejects a bare netflix.com (no www) to match the existing contract", () => {
        expect(isNetflixHouseholdUrl("https://netflix.com/update-household")).toBe(false);
    });

    it("rejects garbage / empty / nullish input", () => {
        expect(isNetflixHouseholdUrl("not a url")).toBe(false);
        expect(isNetflixHouseholdUrl("")).toBe(false);
        expect(isNetflixHouseholdUrl(null)).toBe(false);
        expect(isNetflixHouseholdUrl(undefined)).toBe(false);
    });
});

describe("isNetflixSenderAddress", () => {
    it("accepts known Netflix senders", () => {
        expect(isNetflixSenderAddress("info@account.netflix.com")).toBe(true);
        expect(isNetflixSenderAddress("noreply@mailer.netflix.com")).toBe(true);
        expect(isNetflixSenderAddress("no-reply@netflix.com")).toBe(true);
    });

    it("is case-insensitive", () => {
        expect(isNetflixSenderAddress("Info@Account.Netflix.com")).toBe(true);
    });

    it("rejects a substring spoof attacker-netflix@evil.com", () => {
        expect(isNetflixSenderAddress("attacker-netflix@evil.com")).toBe(false);
    });

    it("rejects a lookalike domain user@evil-netflix.com", () => {
        expect(isNetflixSenderAddress("user@evil-netflix.com")).toBe(false);
    });

    it("rejects userinfo confusion www.netflix.com@evil.com", () => {
        expect(isNetflixSenderAddress("www.netflix.com@evil.com")).toBe(false);
    });

    it("rejects empty / nullish / malformed input", () => {
        expect(isNetflixSenderAddress("")).toBe(false);
        expect(isNetflixSenderAddress(null)).toBe(false);
        expect(isNetflixSenderAddress(undefined)).toBe(false);
        expect(isNetflixSenderAddress("no-at-sign")).toBe(false);
    });
});
