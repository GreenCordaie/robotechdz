import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/auth";

export async function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;

    // Login page is public but should redirect if already logged in (Admin or Reseller)
    if (path === "/admin/login" || path === "/reseller/login") {
        const session = request.cookies.get("session")?.value;
        if (session) {
            try {
                const parsed = await decrypt(session);
                const role = parsed.userRole;
                if (path === "/admin/login" && role !== "RESELLER") {
                    return NextResponse.redirect(new URL("/admin", request.url));
                }
                if (path === "/reseller/login" && role === "RESELLER") {
                    return NextResponse.redirect(new URL("/reseller/dashboard", request.url));
                }
            } catch (e) {
                // Invalid session
            }
        }
        return NextResponse.next();
    }

    // Protect all /admin routes
    if (path.startsWith("/admin")) {
        const session = request.cookies.get("session")?.value;
        if (!session) return NextResponse.redirect(new URL("/admin/login", request.url));

        try {
            const parsed = await decrypt(session);
            const userRole = parsed.userRole;

            if (userRole === "RESELLER") {
                return NextResponse.redirect(new URL("/reseller/dashboard", request.url));
            }

            // RBAC: Restricted routes for CAISSIER and TRAITEUR
            const restrictedRoutes = ["/admin/fournisseurs", "/admin/dashboard"];
            const isRestrictedPath = restrictedRoutes.some(r => path.startsWith(r));

            if (isRestrictedPath && userRole !== "ADMIN") {
                return NextResponse.redirect(new URL("/admin/catalogue", request.url));
            }
        } catch (err) {
            return NextResponse.redirect(new URL("/admin/login", request.url));
        }
    }

    // Protect all /reseller routes
    if (path.startsWith("/reseller")) {
        const session = request.cookies.get("session")?.value;
        if (!session) return NextResponse.redirect(new URL("/reseller/login", request.url));

        try {
            const parsed = await decrypt(session);
            const userRole = parsed.userRole;

            if (userRole !== "RESELLER") {
                // Not a reseller, send to admin if they are staff, or logout
                return NextResponse.redirect(new URL("/admin", request.url));
            }
        } catch (err) {
            return NextResponse.redirect(new URL("/reseller/login", request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/admin/:path*", "/reseller/:path*"],
};
