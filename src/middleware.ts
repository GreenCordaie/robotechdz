import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/auth";

export async function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;

    // Login page is public but should redirect if already logged in
    if (path === "/admin/login") {
        const session = request.cookies.get("session")?.value;
        if (session) {
            try {
                await decrypt(session);
                return NextResponse.redirect(new URL("/admin", request.url));
            } catch (e) {
                // Invalid session, let them stay on login
            }
        }
        return NextResponse.next();
    }

    // Protect all /admin routes
    if (path.startsWith("/admin")) {
        const session = request.cookies.get("session")?.value;

        if (!session) {
            return NextResponse.redirect(new URL("/admin/login", request.url));
        }

        try {
            const parsed = await decrypt(session);
            const userRole = parsed.user.role;

            // RBAC: Restricted routes for CAISSIER and TRAITEUR
            const restrictedRoutes = ["/admin/fournisseurs", "/admin/dashboard"];
            const isRestrictedPath = restrictedRoutes.some(r => path.startsWith(r));

            if (isRestrictedPath && userRole !== "ADMIN") {
                // Redirect to a safe page (e.g., catalogue or caisse)
                return NextResponse.redirect(new URL("/admin/catalogue", request.url));
            }

        } catch (err) {
            return NextResponse.redirect(new URL("/admin/login", request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/admin/:path*"],
};
