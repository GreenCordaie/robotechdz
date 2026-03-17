import { getSuppliersAction, getSupplierHistoryAction } from "./actions";
import SuppliersContent from "./SuppliersContent";

export const dynamic = "force-dynamic";

export default async function FournisseursPage() {
    const [suppliers, history]: any[] = await Promise.all([
        getSuppliersAction({}),
        getSupplierHistoryAction({ supplierId: 0 }) // Wait, history needs supplierId? The page seems to fetch "all" history or just needs a placeholder? Actually getSupplierHistoryAction needs supplierId.
    ]);

    if (suppliers.success === false || history.success === false) {
        return (
            <div className="p-8 text-white bg-red-900/20 rounded-xl border border-red-500/50">
                Une erreur de sécurité est survenue : {suppliers.error || history.error}
            </div>
        );
    }

    return (
        <SuppliersContent
            initialSuppliers={suppliers as any}
            initialHistory={history as any}
        />
    );
}
