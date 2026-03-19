import { getSuppliersAction, getSupplierHistoryAction, getSupplierStatsAction } from "./actions";
import SuppliersViewSwitcher from "./SuppliersViewSwitcher";
import { getShopSettingsAction } from "../settings/actions";

export const dynamic = "force-dynamic";

export default async function FournisseursPage() {
    const [suppliers, history, settings, stats]: any[] = await Promise.all([
        getSuppliersAction({}),
        getSupplierHistoryAction({ supplierId: 0 }),
        getShopSettingsAction({}),
        getSupplierStatsAction({})
    ]);

    if (suppliers.success === false || history.success === false) {
        return (
            <div className="p-8 text-white bg-red-900/20 rounded-xl border border-red-500/50">
                Une erreur de sécurité est survenue : {suppliers.error || history.error}
            </div>
        );
    }

    return (
        <SuppliersViewSwitcher
            initialSuppliers={suppliers as any}
            initialHistory={history as any}
            shopSettings={settings.success ? settings.data : null}
            initialStats={stats.success ? stats.data : null}
        />
    );
}
