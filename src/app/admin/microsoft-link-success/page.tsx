import { Suspense } from "react";
import MicrosoftLinkResult from "./MicrosoftLinkResult";

export const metadata = { title: "Liaison Microsoft — Admin" };

export default function MicrosoftLinkSuccessPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-gray-950 text-white">Chargement...</div>}>
            <MicrosoftLinkResult />
        </Suspense>
    );
}
