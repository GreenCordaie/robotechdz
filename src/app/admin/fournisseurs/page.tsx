import { getSuppliers, getSupplierHistory } from "./actions";
import SuppliersContent from "./SuppliersContent";

export const dynamic = "force-dynamic";

export default async function FournisseursPage() {
    const [suppliers, history] = await Promise.all([
        getSuppliers(),
        getSupplierHistory()
    ]);

    return (
        <SuppliersContent
            initialSuppliers={suppliers as any}
            initialHistory={history as any}
        />
    );
}
