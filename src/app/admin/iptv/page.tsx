import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security";
import { fetchIptvProvisions } from "./queries";
import IptvContent from "./IptvContent";

export const dynamic = "force-dynamic";

export default async function IptvPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/admin/login");

    try {
        const provisions = await fetchIptvProvisions();
        return <IptvContent initialProvisions={provisions} />;
    } catch (error) {
        console.error("IPTV page error:", error);
        return (
            <div className="p-8 text-red-500 font-bold uppercase tracking-widest text-center">
                Erreur de chargement IPTV.
            </div>
        );
    }
}
