import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/jwt";
import { UserRole } from "@/lib/constants";

export async function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;

    const response = NextResponse.next();

    // 1. Security Headers
    const isDev = process.env.NODE_ENV === "development";

    const securityHeaders = {
        'Content-Security-Policy': [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://static.cloudflareinsights.com https://challenges.cloudflare.com`,
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: https:",
            "connect-src 'self' https://api.groq.com https://*.trycloudflare.com https://static.cloudflareinsights.com https://challenges.cloudflare.com",
            "frame-src https://challenges.cloudflare.com",
            "frame-ancestors 'none'",
            "base-uri 'self'"
        ].join('; '),
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };

    Object.entries(securityHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Pages publiques sous /admin/* ou /reseller/* (login + signup public B2B)
    const PUBLIC_RESELLER_PATHS = ["/admin/login", "/reseller/login", "/reseller/signup"];
    if (PUBLIC_RESELLER_PATHS.includes(path)) {
        const session = request.cookies.get("session")?.value;
        if (session) {
            try {
                const parsed = await decrypt(session);
                const role = parsed.userRole;
                // Login pages : redirect vers dashboard si déjà loggé
                if (path === "/admin/login" && role !== UserRole.RESELLER) {
                    return NextResponse.redirect(new URL("/admin/dashboard", request.url));
                }
                if (path === "/reseller/login" && role === UserRole.RESELLER) {
                    return NextResponse.redirect(new URL("/reseller/dashboard", request.url));
                }
                // /reseller/signup : reste accessible même loggé (lien depuis B2B page)
            } catch (e) { }
        }
        return response;
    }

    // SuperAdmin protection (strict SUPER_ADMIN role required)
    if (path.startsWith("/superadmin")) {
        const session = request.cookies.get("session")?.value;
        if (!session) {
            const loginUrl = new URL("/admin/login", request.url);
            loginUrl.searchParams.set("redirect", path);
            return NextResponse.redirect(loginUrl);
        }
        try {
            const parsed = await decrypt(session);
            if (parsed.userRole !== UserRole.SUPER_ADMIN) {
                // Defense-in-depth: layout double-checks via hasRole.
                return NextResponse.redirect(new URL("/admin/dashboard", request.url));
            }
        } catch (err) {
            return NextResponse.redirect(new URL("/admin/login", request.url));
        }
        return response;
    }

    // Admin & Reseller protection
    if (path.startsWith("/admin") || path.startsWith("/reseller")) {
        const session = request.cookies.get("session")?.value;
        if (!session) {
            const loginPath = path.startsWith("/admin") ? "/admin/login" : "/reseller/login";
            return NextResponse.redirect(new URL(loginPath, request.url));
        }

        try {
            const parsed = await decrypt(session);
            const userRole = parsed.userRole;

            if (path.startsWith("/admin") && userRole === UserRole.RESELLER) {
                return NextResponse.redirect(new URL("/reseller/dashboard", request.url));
            }
            if (path.startsWith("/reseller") && userRole !== UserRole.RESELLER) {
                return NextResponse.redirect(new URL("/admin/dashboard", request.url));
            }

            // RBAC for admin (Default Deny - Whitelist approach).
            // SUPER_ADMIN is the highest role (> ADMIN) and must keep full
            // access to every /admin/* route — including /admin/b2b/* (central
            // wallet, etc.). Only the lower roles (CAISSIER, TRAITEUR) are
            // constrained to the whitelist below.
            if (path.startsWith("/admin")) {
                if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_ADMIN) {
                    const permittedPaths = [
                        "/admin/dashboard",
                        "/admin/caisse",
                        "/admin/catalogue",
                        "/admin/traitement",
                        "/admin/commandes",
                        "/admin/support",
                        "/admin/iptv",
                        "/admin/login"
                    ];

                    const isPermitted = permittedPaths.some(p => path === p || path.startsWith(p + "/"));
                    if (!isPermitted) {
                        return NextResponse.redirect(new URL("/admin/catalogue", request.url));
                    }
                }
            }
        } catch (err) {
            const loginPath = path.startsWith("/admin") ? "/admin/login" : "/reseller/login";
            return NextResponse.redirect(new URL(loginPath, request.url));
        }
    }

    return response;
}

export const config = {
    matcher: ["/admin/:path*", "/reseller/:path*", "/superadmin/:path*"],
};
