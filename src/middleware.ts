import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/jwt";
import { UserRole } from "@/lib/constants";

export async function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;

    const response = NextResponse.next();

    // 1. Security Headers
    const securityHeaders = {
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://r2cdn.perplexity.ai; img-src 'self' data: https:; connect-src 'self' https:;",
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };

    Object.entries(securityHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Login page logic (already implemented but kept for flow)
    if (path === "/admin/login" || path === "/reseller/login") {
        const session = request.cookies.get("session")?.value;
        if (session) {
            try {
                const parsed = await decrypt(session);
                const role = parsed.userRole;
                if (path === "/admin/login" && role !== UserRole.RESELLER) {
                    return NextResponse.redirect(new URL("/admin", request.url));
                }
                if (path === "/reseller/login" && role === UserRole.RESELLER) {
                    return NextResponse.redirect(new URL("/reseller/dashboard", request.url));
                }
            } catch (e) { }
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
                return NextResponse.redirect(new URL("/admin", request.url));
            }

            // RBAC for admin (Default Deny - Whitelist approach)
            if (path.startsWith("/admin")) {
                if (userRole !== UserRole.ADMIN) {
                    const permittedPaths = [
                        "/admin/caisse",
                        "/admin/catalogue",
                        "/admin/traitement",
                        "/admin/support",
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
    matcher: ["/admin/:path*", "/reseller/:path*"],
};
