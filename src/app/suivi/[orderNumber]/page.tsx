"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock, Package, KeyRound, AlertCircle, Copy, Phone, Lock, Unlock, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function OrderTrackingPage() {
    const params = useParams();
    const rawOrderNumber = decodeURIComponent(params.orderNumber as string);
    // Assure order starts with #
    const orderNumber = rawOrderNumber.startsWith('#') ? rawOrderNumber : `#${rawOrderNumber}`;

    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [phoneDigits, setPhoneDigits] = useState("");
    const [verifyingPhone, setVerifyingPhone] = useState(false);
    const [phoneError, setPhoneError] = useState("");

    const fetchOrder = async (phoneToVerify?: string) => {
        try {
            let url = `/api/orders/track?orderNumber=${encodeURIComponent(orderNumber)}`;
            if (phoneToVerify) {
                url += `&phoneDigits=${encodeURIComponent(phoneToVerify)}`;
            } else if (phoneDigits.length === 4) {
                url += `&phoneDigits=${encodeURIComponent(phoneDigits)}`; // keep validated session in polling
            }

            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Erreur de chargement");
                setOrder(null);
            } else {
                setOrder(data);
                setError("");
                if (phoneToVerify && !data.isPhoneValidated) {
                    setPhoneError("Les chiffres ne correspondent pas au numéro de la commande.");
                } else if (phoneToVerify && data.isPhoneValidated) {
                    setPhoneError("");
                }
            }
        } catch (err) {
            setError("Erreur de connexion au serveur");
        } finally {
            setLoading(false);
            setVerifyingPhone(false);
        }
    };

    // Polling every 5 seconds for real-time updates
    useEffect(() => {
        fetchOrder();
        const interval = setInterval(() => {
            fetchOrder();
        }, 5000);
        return () => clearInterval(interval);
    }, [orderNumber]);

    const handleVerifyPhone = (e: React.FormEvent) => {
        e.preventDefault();
        setPhoneError("");
        if (phoneDigits.length !== 4) {
            setPhoneError("Veuillez entrer exactement 4 chiffres.");
            return;
        }
        setVerifyingPhone(true);
        fetchOrder(phoneDigits);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Could add a toast here
    };

    if (loading && !order) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center space-y-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Recherche de la commande...</p>
                </div>
            </div>
        );
    }

    if (error && !order) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Commande introuvable</h2>
                    <p className="text-gray-500 mb-6">{error}</p>
                    <Link href="/suivi" className="inline-flex items-center text-indigo-600 font-medium hover:text-indigo-800">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Retour à la recherche
                    </Link>
                </div>
            </div>
        );
    }

    if (!order) return null;

    const getStatusStep = () => {
        switch (order.status) {
            case 'EN_ATTENTE': return 1;
            case 'PAYE': return 2;
            case 'TERMINE': return 3;
            case 'ANNULE': return -1;
            default: return 0;
        }
    };
    const currentStep = getStatusStep();

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto space-y-8">
                {/* Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-6 sm:px-8 sm:py-8 bg-indigo-600">
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-3xl font-bold text-white tracking-tight">{order.orderNumber}</h1>
                                <p className="text-indigo-100 mt-1">
                                    Commandé le {new Date(order.createdAt).toLocaleDateString('fr-FR', {
                                        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })}
                                </p>
                            </div>
                            <div className="bg-white/20 font-semibold px-4 py-2 rounded-lg text-white backdrop-blur-sm">
                                {order.totalAmount} DZD
                            </div>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="px-6 py-8 sm:px-8">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6">Suivi en temps réel</h3>

                        {order.status === 'ANNULE' ? (
                            <div className="flex items-center p-4 bg-red-50 text-red-700 rounded-xl">
                                <AlertCircle className="w-6 h-6 mr-3 flex-shrink-0" />
                                <div>
                                    <p className="font-bold">Commande annulée</p>
                                    <p className="text-sm text-red-600 mt-1">Cette commande a été annulée et ne sera pas traitée.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="relative">
                                {/* Line connecting steps */}
                                <div className="absolute top-5 left-6 bottom-5 w-0.5 bg-gray-200" aria-hidden="true">
                                    <div className="absolute top-0 left-0 w-full bg-indigo-600 transition-all duration-500"
                                        style={{ height: currentStep === 1 ? '10%' : currentStep === 2 ? '50%' : '100%' }}>
                                    </div>
                                </div>

                                <ul className="space-y-8 relative">
                                    {/* Step 1 */}
                                    <li className="flex items-start">
                                        <div className={`relative w-12 h-12 flex items-center justify-center rounded-full shrink-0 z-10 transition-colors ${currentStep >= 1 ? 'bg-indigo-600 text-white' : 'bg-gray-100 border-2 border-gray-200 text-gray-400'}`}>
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                            </svg>
                                        </div>
                                        <div className="ml-4 mt-2">
                                            <h4 className={`text-base font-bold ${currentStep >= 1 ? 'text-gray-900' : 'text-gray-500'}`}>Commande reçue</h4>
                                            <p className="text-sm text-gray-500 mt-1">Votre commande est en attente de paiement.</p>
                                        </div>
                                    </li>

                                    {/* Step 2 */}
                                    <li className="flex items-start">
                                        <div className={`relative w-12 h-12 flex items-center justify-center rounded-full shrink-0 z-10 transition-colors ${currentStep >= 2 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-gray-100 border-2 border-gray-200 text-gray-400'}`}>
                                            <Clock className="w-6 h-6" />
                                        </div>
                                        <div className="ml-4 mt-2">
                                            <h4 className={`text-base font-bold ${currentStep >= 2 ? 'text-gray-900' : 'text-gray-500'}`}>Paiement validé</h4>
                                            <p className="text-sm text-gray-500 mt-1">Traitement et préparation de vos accès numériques.</p>
                                        </div>
                                    </li>

                                    {/* Step 3 */}
                                    <li className="flex items-start">
                                        <div className={`relative w-12 h-12 flex items-center justify-center rounded-full shrink-0 z-10 transition-colors ${currentStep >= 3 ? 'bg-green-500 text-white shadow-lg shadow-green-200' : 'bg-gray-100 border-2 border-gray-200 text-gray-400'}`}>
                                            <CheckCircle2 className="w-6 h-6" />
                                        </div>
                                        <div className="ml-4 mt-2">
                                            <h4 className={`text-base font-bold ${currentStep >= 3 ? 'text-gray-900' : 'text-gray-500'}`}>Prête / Livrée</h4>
                                            <p className="text-sm text-gray-500 mt-1">Vos accès sont prêts à être utilisés.</p>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        )}
                    </div>
                </div>

                {/* Delivery Section (Codes) */}
                {order.status === 'TERMINE' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
                        <div className="px-6 py-4 bg-green-50 border-b border-green-100 flex items-center">
                            <KeyRound className="w-5 h-5 text-green-600 mr-2" />
                            <h3 className="text-lg font-bold text-green-900">Vos Accès Numériques</h3>
                        </div>

                        <div className="p-6">
                            {order.phoneRequired && !order.isPhoneValidated ? (
                                /* Security verification step */
                                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 text-center max-w-lg mx-auto">
                                    <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Lock className="w-8 h-8" />
                                    </div>
                                    <h4 className="text-xl font-bold text-gray-900 mb-2">Sécurité des codes</h4>
                                    <p className="text-gray-600 mb-6 text-sm">
                                        Pour afficher vos codes d'accès, veuillez vérifier votre identité en saisissant les
                                        <strong className="text-gray-900"> 4 derniers chiffres</strong> du numéro de téléphone associé à cette commande.
                                    </p>

                                    <form onSubmit={handleVerifyPhone} className="flex flex-col items-center">
                                        <div className="flex items-center gap-4 mb-2">
                                            <div className="text-gray-400 font-mono tracking-widest text-lg">******</div>
                                            <input
                                                type="text"
                                                maxLength={4}
                                                className="w-24 text-center text-lg tracking-widest font-mono border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 py-3"
                                                placeholder="XXXX"
                                                value={phoneDigits}
                                                onChange={e => setPhoneDigits(e.target.value.replace(/\D/g, ''))}
                                                required
                                            />
                                        </div>
                                        {phoneError && <p className="text-sm text-red-600 mb-4">{phoneError}</p>}

                                        <button
                                            type="submit"
                                            disabled={verifyingPhone || phoneDigits.length !== 4}
                                            className="w-full sm:w-auto mt-4 inline-flex justify-center items-center px-6 py-3 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                                        >
                                            {verifyingPhone ? 'Vérification...' : (
                                                <><Unlock className="w-4 h-4 mr-2" /> Débloquer les accès</>
                                            )}
                                        </button>
                                    </form>
                                </div>
                            ) : (
                                /* Codes Display */
                                <div className="space-y-6">
                                    <div className="flex items-center text-sm text-green-700 bg-green-50 p-3 rounded-lg border border-green-100">
                                        <CheckCircle2 className="w-5 h-5 mr-2 flex-shrink-0" />
                                        Identité vérifiée avec succès. Voici vos codes d'activation.
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {order.items.map((item: any, i: number) => (
                                            <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col justify-between">
                                                <div>
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 mb-2">
                                                        {item.quantity}x
                                                    </span>
                                                    <h4 className="font-bold text-gray-900 mb-3">{item.productName}</h4>

                                                    <div className="space-y-3">
                                                        {/* Codes standards */}
                                                        {item.codes && item.codes.map((code: string, idx: number) => (
                                                            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 flex justify-between items-center group">
                                                                <code className="text-sm font-bold text-gray-800 break-all">{code}</code>
                                                                <button onClick={() => copyToClipboard(code)} className="text-gray-400 hover:text-indigo-600 p-2 rounded-md hover:bg-indigo-50 transition-colors" title="Copier">
                                                                    <Copy className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ))}

                                                        {/* Profils (Slots) */}
                                                        {item.slots && item.slots.map((slot: any, idx: number) => (
                                                            <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                                                                <div className="bg-gray-100 px-3 py-1.5 border-b border-gray-200 text-xs font-semibold text-gray-600">
                                                                    Profil N° {slot.slotNumber}
                                                                </div>
                                                                <div className="p-3 flex justify-between items-center group">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-xs text-gray-500 mb-1">Accès (Email/Code)</span>
                                                                        <code className="text-sm font-bold text-gray-800 break-all">{slot.parentCode}</code>
                                                                        {slot.pin && (
                                                                            <div className="mt-2 text-xs flex items-center font-medium bg-yellow-50 text-yellow-800 px-2 py-1 rounded inline-block w-max">
                                                                                <Lock className="w-3 h-3 mr-1" /> PIN: {slot.pin}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <button onClick={() => copyToClipboard(slot.parentCode)} className="text-gray-400 hover:text-indigo-600 p-2 rounded-md hover:bg-indigo-50 transition-colors self-end" title="Copier l'accès">
                                                                        <Copy className="w-5 h-5" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}

                                                        {(!item.codes?.length && !item.slots?.length) && (
                                                            <p className="text-sm text-gray-500 italic">Aucun code disponible pour cet article.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-8 text-center">
                <Link href="/suivi" className="text-sm text-gray-500 hover:text-indigo-600 font-medium">
                    Suivre une autre commande
                </Link>
            </div>
        </div>
    );
}
