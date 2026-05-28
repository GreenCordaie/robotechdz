/**
 * Pure, dependency-free Netflix trust guards.
 *
 * Shared by the mailbox watcher (server-side auto-approve click via LoadBrain),
 * the email parser, and the activation page (client `href`). Centralising the
 * checks here stops an attacker from smuggling a non-Netflix host past the
 * email parser — e.g. `https://www.netflix.com@evil.com/update-household` whose
 * real host is `evil.com`, or `https://www.netflix.com.evil.com/verify`.
 */

const NETFLIX_HOST = "www.netflix.com";

/**
 * True only for an `https://www.netflix.com/...` URL. Uses the URL parser
 * (not a string prefix) so userinfo/subdomain confusion can't pass.
 */
export function isNetflixHouseholdUrl(raw: string | null | undefined): boolean {
    if (!raw) return false;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    return url.protocol === "https:" && url.hostname === NETFLIX_HOST;
}

/**
 * True only when the sender's email domain is `netflix.com` or a subdomain.
 * Rejects substring spoofs (`evil-netflix.com`, `attacker@notnetflix.com`) and
 * userinfo tricks (`www.netflix.com@evil.com` → domain part is `evil.com`).
 */
export function isNetflixSenderAddress(addr: string | null | undefined): boolean {
    if (!addr) return false;
    const domain = addr.toLowerCase().trim().split("@")[1] ?? "";
    return domain === "netflix.com" || domain.endsWith(".netflix.com");
}
