"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, Suspense } from "react";

function MicrosoftCallbackContent() {
    const params = useSearchParams();
    const router = useRouter();

    const auth = params.get("auth");
    const id = params.get("id");
    const msg = params.get("msg");
    const isSuccess = auth === "success";

    useEffect(() => {
        if (isSuccess) {
            const timer = setTimeout(() => {
                router.push("/admin/comptes-partages");
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [isSuccess, router]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-950">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
                {isSuccess ? (
                    <>
                        <div className="text-6xl mb-4">✅</div>
                        <h1 className="text-2xl font-bold text-white mb-2">Compte Microsoft lié avec succès</h1>
                        <p className="text-gray-400 mb-1">Le compte a été connecté. La résolution Netflix est maintenant automatique.</p>
                        {id && (
                            <p className="text-gray-500 text-sm mb-6">ID compte : <span className="text-blue-400 font-mono">#{id}</span></p>
                        )}
                        <p className="text-gray-500 text-sm">Redirection automatique dans 4 secondes...</p>
                        <button
                            onClick={() => router.push("/admin/comptes-partages")}
                            className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition"
                        >
                            Retour aux comptes partagés
                        </button>
                    </>
                ) : (
                    <>
                        <div className="text-6xl mb-4">❌</div>
                        <h1 className="text-2xl font-bold text-white mb-2">Échec de la liaison</h1>
                        <p className="text-gray-400 mb-6">
                            {msg ? decodeURIComponent(msg) : "Une erreur s'est produite lors de l'authentification Microsoft."}
                        </p>
                        <button
                            onClick={() => router.push("/admin/comptes-partages")}
                            className="mt-2 w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2.5 rounded-lg transition"
                        >
                            Retour aux comptes partagés
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function MicrosoftCallbackPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-gray-950 text-white">Chargement...</div>}>
            <MicrosoftCallbackContent />
        </Suspense>
    );
}
