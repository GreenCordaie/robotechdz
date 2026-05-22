import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";
import { hasRole } from "@/lib/roles";
import { UserRole } from "@/lib/constants";
import { fetchLoadbrainProviders } from "@/lib/loadbrain-providers-registry";
import { ProvidersTable } from "./ProvidersTable";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
    const user = await getCurrentUser();
    if (!hasRole(user, UserRole.SUPER_ADMIN)) redirect("/admin");

    const initial = await fetchLoadbrainProviders();

    return (
        <div className="space-y-4">
            <header>
                <h2 className="text-2xl font-bold text-white">Providers LoadBrain</h2>
                <p className="text-sm text-neutral-400 mt-1">
                    Solde + healthcheck temps réel des fournisseurs (BSV, PrepaidForge à venir).
                    Refresh auto toutes les 5 minutes.
                </p>
            </header>
            <ProvidersTable initial={initial} />
        </div>
    );
}
