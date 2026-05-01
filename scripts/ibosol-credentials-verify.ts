// scripts/ibosol-credentials-verify.ts
import {
    isIbosolPayload,
    isPartialSuccess,
    formatIbosolCode,
    parseIbosolCustomData,
    parseIbosolExpires,
} from "../src/lib/ibosol-credentials";

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exit(1);
    }
    console.log(`✅ ${message}`);
}

// isIbosolPayload
assert(isIbosolPayload({ mac: "AA:BB" }) === true, "isIbosolPayload: detects mac");
assert(isIbosolPayload({ activationCode: "1234" }) === true, "isIbosolPayload: detects activationCode");
assert(isIbosolPayload({ playlistInjected: false }) === true, "isIbosolPayload: detects playlistInjected=false");
assert(isIbosolPayload({ screens: [{ username: "x" }] }) === false, "isIbosolPayload: rejects IPTV screens");
assert(isIbosolPayload(null) === false, "isIbosolPayload: rejects null");

// isPartialSuccess
assert(
    isPartialSuccess({ isActivated: true, iptvUsername: "u", iptvPassword: "p" }, true) === false,
    "isPartialSuccess: combo OK is not partial"
);
assert(
    isPartialSuccess({ isActivated: true }, true) === true,
    "isPartialSuccess: combo without IPTV creds is partial"
);
assert(
    isPartialSuccess({ isActivated: true }, false) === false,
    "isPartialSuccess: no combo requested is never partial"
);

// formatIbosolCode
const code = formatIbosolCode({ mac: "AA:BB", activationCode: "0929", expiresAt: "2027-05-01" });
assert(
    code === "MAC: AA:BB | Code activation: 0929 | Expire: 2027-05-01",
    "formatIbosolCode: 3 fields formatted"
);
assert(formatIbosolCode({}) === "", "formatIbosolCode: empty payload returns empty string");

// parseIbosolCustomData
const valid = parseIbosolCustomData('{"type":"ibosol","mac":"AA","appId":1}');
assert(valid !== null && valid.mac === "AA" && valid.appId === 1, "parseIbosolCustomData: valid JSON");
assert(parseIbosolCustomData("credentials") === null, "parseIbosolCustomData: IPTV string returns null");
assert(parseIbosolCustomData(null) === null, "parseIbosolCustomData: null returns null");
assert(parseIbosolCustomData("{invalid json") === null, "parseIbosolCustomData: bad JSON returns null");
assert(parseIbosolCustomData('{"type":"player","mac":"AA"}') === null, "parseIbosolCustomData: wrong type returns null");

// parseIbosolExpires
const d1 = parseIbosolExpires("2027-05-01");
assert(d1 !== null && d1.toISOString().startsWith("2027-05-01"), "parseIbosolExpires: ISO date");
const d2 = parseIbosolExpires("01-05-2027 14:30");
assert(d2 !== null && d2.toISOString() === "2027-05-01T14:30:00.000Z", "parseIbosolExpires: DD-MM-YYYY HH:mm");
assert(parseIbosolExpires(null) === null, "parseIbosolExpires: null returns null");
assert(parseIbosolExpires("pending") === null, "parseIbosolExpires: 'pending' returns null");

console.log("\n🎉 All assertions passed");
