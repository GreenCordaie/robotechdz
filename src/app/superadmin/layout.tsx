import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";
import { hasRole } from "@/lib/roles";
import { UserRole } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/admin/login");
    }
    if (!hasRole(user, UserRole.SUPER_ADMIN)) {
        // ADMIN ou autres : redirect vers /admin (defense in depth, middleware filtre déjà)
        redirect("/admin/dashboard");
    }
    return (
        <div className="min-h-screen bg-neutral-950 text-white">
            <header className="border-b border-neutral-800 p-4">
                <h1 className="text-xl font-bold tracking-widest uppercase">SUPER_ADMIN</h1>
                <p className="text-xs text-neutral-500">
                    Command Center — providers LoadBrain + finance globale
                </p>
            </header>
            <main className="p-6">{children}</main>
        </div>
    );
}
