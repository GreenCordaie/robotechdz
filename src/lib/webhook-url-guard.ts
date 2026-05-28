/**
 * SSRF guard for reseller-supplied webhook URLs. Pure (no DNS lookup).
 *
 * Blocks non-http(s) schemes and loopback / private / link-local / cloud-metadata
 * targets, including the common bypasses the old regex missed:
 *   - IPv6 literals  http://[::1]/  , IPv4-mapped  http://[::ffff:127.0.0.1]/
 *   - integer / hex IPv4  http://2130706433/  , http://0x7f000001/
 *   - localhost / *.local / *.internal / *.localhost
 *
 * Known residual gap: DNS-based rebinding (a public hostname that resolves to a
 * private IP, e.g. *.nip.io) is NOT caught here — that needs resolution at fetch
 * time or an egress allowlist. Tracked separately.
 */

function ipv4FirstTwoArePrivate(a: number, b: number): boolean {
    if (a === 0 || a === 10 || a === 127) return true; // this-host / private / loopback
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    return false;
}

function parseDottedIPv4(host: string): [number, number, number, number] | null {
    const segs = host.split(".");
    if (segs.length !== 4) return null;
    const nums: number[] = [];
    for (const s of segs) {
        if (!/^\d{1,3}$/.test(s)) return null;
        const n = Number(s);
        if (n > 255) return null;
        nums.push(n);
    }
    return [nums[0], nums[1], nums[2], nums[3]];
}

function isBlockedIPv6(addr: string): boolean {
    const h = addr.toLowerCase();
    if (h === "::1" || h === "::") return true; // loopback / unspecified

    // IPv4-mapped. WHATWG URL normalises "::ffff:127.0.0.1" → "::ffff:7f00:1"
    // (hex), so accept both the dotted and the hex form.
    const mapped = h.match(/^::ffff:(.+)$/);
    if (mapped) {
        const rest = mapped[1];
        const dotted = parseDottedIPv4(rest);
        if (dotted) return ipv4FirstTwoArePrivate(dotted[0], dotted[1]);
        const groups = rest.split(":");
        if (groups.length === 2 && /^[0-9a-f]{1,4}$/.test(groups[0]) && /^[0-9a-f]{1,4}$/.test(groups[1])) {
            const hi = parseInt(groups[0], 16);
            return ipv4FirstTwoArePrivate((hi >> 8) & 0xff, hi & 0xff);
        }
        return true; // unknown mapped form → block to be safe
    }

    if (/^fe[89ab]/.test(h)) return true; // link-local fe80::/10
    if (/^f[cd]/.test(h)) return true; // unique-local fc00::/7
    return false;
}

/**
 * Returns true if the URL must be rejected (unsafe to fetch server-side).
 */
export function isBlockedWebhookUrl(rawUrl: string): boolean {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return true; // unparseable → reject
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") return true;

    const host = url.hostname.toLowerCase();
    if (!host) return true;

    // IPv6 literal — URL.hostname keeps the brackets, e.g. "[::1]".
    if (host.startsWith("[") && host.endsWith("]")) {
        return isBlockedIPv6(host.slice(1, -1));
    }

    if (host === "localhost") return true;
    if (
        host.endsWith(".localhost") ||
        host.endsWith(".local") ||
        host.endsWith(".internal")
    ) {
        return true;
    }

    const v4 = parseDottedIPv4(host);
    if (v4) return ipv4FirstTwoArePrivate(v4[0], v4[1]);

    // Integer / hex IPv4 forms (no dots). No legitimate webhook host is all-digits
    // or 0x-prefixed, and these decode to addresses like 127.0.0.1.
    if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/.test(host)) return true;

    return false;
}
