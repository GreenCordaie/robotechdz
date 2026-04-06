"use client";

import { useState, useEffect } from "react";
import { Button } from "@heroui/react";
import { Plus, Trash2, Save, MessageCircleQuestion, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { getFaqsAction, saveFaqsAction } from "@/app/admin/settings/actions";
import toast from "react-hot-toast";

interface Faq {
    id?: number;
    question: string;
    answer: string;
    isNew?: boolean;
}

const STARTER_FAQS: Omit<Faq, "id">[] = [
    {
        question: "mon code netflix ne fonctionne pas / code invalide",
        answer: "1. Vérifiez que vous copiez le code sans espaces ni caractères supplémentaires\n2. Sur Netflix : Paramètres du compte → Racheter un code cadeau\n3. Si le code a déjà été utilisé ou expiré, contactez-nous, on le remplace immédiatement 🔄"
    },
    {
        question: "je n'arrive pas à me connecter sur netflix / mot de passe incorrect",
        answer: "1. Copiez-collez exactement l'email et le mot de passe reçus (attention aux majuscules)\n2. Si ça ne marche pas, allez sur netflix.com → Besoin d'aide pour vous connecter → Ne faites PAS de réinitialisation de mot de passe\n3. Contactez-nous si le problème persiste, on règle ça en 5 min ✅"
    },
    {
        question: "le profil netflix est pris / profil indisponible / trop d'utilisateurs",
        answer: "Le profil est temporairement occupé. Attendez 10 minutes et réessayez. Si le problème continue, écrivez-nous et nous libérons votre profil immédiatement 🙏"
    },
    {
        question: "spotify ne fonctionne pas / spotify premium ne marche pas",
        answer: "1. Assurez-vous de cliquer sur 'Se connecter' et NON 'S'inscrire'\n2. Entrez exactement l'email et le mot de passe fournis\n3. Ne changez PAS le mot de passe ni les infos du compte\n4. Déconnectez-vous d'abord si vous êtes connecté avec un autre compte"
    },
    {
        question: "comment installer netflix sur smart tv / samsung / lg / android tv",
        answer: "Samsung : Smart Hub → Chercher 'Netflix' → Installer → Se connecter\nLG : LG Content Store → Netflix → Installer\nAndroid TV / Hisense : Google Play → Netflix → Installer\nUtilisez les identifiants fournis par la boutique 📺"
    },
    {
        question: "code psn invalide / code playstation ne fonctionne pas",
        answer: "1. Sur PS4/PS5 : PlayStation Store → '...' → Racheter des codes\n2. Entrez le code exactement (sans espaces)\n3. Si erreur 'code déjà utilisé' → contactez-nous immédiatement pour remplacement\n4. Les codes PSN sont valides pour la région correspondante (vérifiez votre région)"
    },
    {
        question: "je n'ai pas reçu mon code / commande traitée mais pas de message",
        answer: "1. Vérifiez vos messages WhatsApp (parfois filtré en spam)\n2. Allez sur notre site → Suivi de commande → entrez votre numéro de commande\n3. Envoyez-nous votre numéro de commande ici, on vous renvoie les codes dans l'instant 📦"
    },
    {
        question: "le compte est bloqué / suspendu / accès refusé",
        answer: "Ne paniquez pas ! Écrivez-nous avec votre numéro de commande et on règle ça prioritairement. Un nouveau compte vous sera fourni si nécessaire ✅"
    },
    {
        question: "canva pro ne marche pas / accès pro non disponible",
        answer: "1. Connectez-vous avec l'email fourni (connexion Google si l'email est Gmail)\n2. Vérifiez dans Canva → Paramètres du compte → vous devriez voir 'Canva Pro'\n3. Si vous voyez 'Free', écrivez-nous avec votre email, on vérifie l'activation 🎨"
    },
    {
        question: "vpn nordvpn / expressvpn ne se connecte pas",
        answer: "1. Téléchargez l'app officielle (ne pas utiliser de sources tierces)\n2. Connectez-vous avec les identifiants fournis\n3. Choisissez un serveur proche (France, Allemagne)\n4. Si 'Abonnement expiré' → contactez-nous pour vérification 🔒"
    },
];

export function FaqBotSettings() {
    const [faqs, setFaqs] = useState<Faq[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    useEffect(() => {
        getFaqsAction({}).then(res => {
            if (res.success && res.faqs) setFaqs(res.faqs);
            setLoading(false);
        });
    }, []);

    const addFaq = () => {
        const newFaq: Faq = { question: "", answer: "", isNew: true };
        setFaqs(prev => [...prev, newFaq]);
        setExpandedIdx(faqs.length);
    };

    const removeFaq = (idx: number) => {
        setFaqs(prev => prev.filter((_, i) => i !== idx));
        setExpandedIdx(null);
    };

    const updateFaq = (idx: number, field: "question" | "answer", value: string) => {
        setFaqs(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
    };

    const loadStarters = () => {
        const existing = new Set(faqs.map(f => f.question.toLowerCase().trim()));
        const toAdd = STARTER_FAQS.filter(f => !existing.has(f.question.toLowerCase().trim()));
        if (toAdd.length === 0) { toast("Tous les modèles sont déjà présents ✅"); return; }
        setFaqs(prev => [...prev, ...toAdd.map(f => ({ ...f, isNew: true }))]);
        toast.success(`${toAdd.length} fiches ajoutées — pensez à sauvegarder`);
    };

    const save = async () => {
        const valid = faqs.filter(f => f.question.trim() && f.answer.trim());
        if (valid.length !== faqs.length) {
            toast.error("Supprimez les fiches vides avant de sauvegarder");
            return;
        }
        setSaving(true);
        const res = await saveFaqsAction({ faqs: valid.map(f => ({ id: f.id, question: f.question.trim(), answer: f.answer.trim() })) });
        setSaving(false);
        if (res.success) {
            toast.success("Fiches FAQ sauvegardées ✅");
            if (res.faqs) setFaqs(res.faqs);
        } else {
            toast.error("Erreur lors de la sauvegarde");
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <MessageCircleQuestion size={16} className="text-[var(--primary)]" />
                        Fiches Problèmes & Solutions
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        L'IA consulte ces fiches en priorité quand un client décrit un problème similaire.
                    </p>
                </div>
                <span className="text-xs bg-white/5 text-slate-400 px-2 py-1 rounded-full shrink-0">{faqs.length} fiche{faqs.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Starter pack */}
            {faqs.length === 0 && (
                <button
                    onClick={loadStarters}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border border-dashed border-purple-500/40 bg-purple-500/5 text-purple-400 text-sm hover:bg-purple-500/10 transition-colors"
                >
                    <Sparkles size={15} />
                    Charger les 10 fiches de départ (Netflix, PSN, Spotify...)
                </button>
            )}

            {/* FAQ list */}
            <div className="space-y-2">
                {faqs.map((faq, idx) => (
                    <div key={idx} className="rounded-xl border border-white/5 bg-[#1a1a1a] overflow-hidden">
                        <button
                            className="w-full flex items-center gap-3 px-4 py-3 text-left"
                            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                        >
                            <MessageCircleQuestion size={14} className="text-[var(--primary)] shrink-0" />
                            <span className="flex-1 text-xs text-slate-300 truncate">
                                {faq.question || <span className="text-slate-600 italic">Nouvelle fiche…</span>}
                            </span>
                            {expandedIdx === idx
                                ? <ChevronUp size={14} className="text-slate-500 shrink-0" />
                                : <ChevronDown size={14} className="text-slate-500 shrink-0" />
                            }
                        </button>

                        {expandedIdx === idx && (
                            <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 block">
                                        Mots-clés / Question client
                                    </label>
                                    <input
                                        value={faq.question}
                                        onChange={e => updateFaq(idx, "question", e.target.value)}
                                        placeholder="ex: code netflix ne fonctionne pas, code invalide"
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[var(--primary)]/50"
                                    />
                                    <p className="text-[10px] text-slate-600 mt-1">Séparez plusieurs variantes par des virgules. L'IA cherche par mots-clés.</p>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 block">
                                        Solution à donner
                                    </label>
                                    <textarea
                                        value={faq.answer}
                                        onChange={e => updateFaq(idx, "answer", e.target.value)}
                                        placeholder="Étapes numérotées, conseils..."
                                        rows={5}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[var(--primary)]/50 resize-none font-mono"
                                    />
                                </div>
                                <button
                                    onClick={() => removeFaq(idx)}
                                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                                >
                                    <Trash2 size={12} />
                                    Supprimer cette fiche
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
                <button
                    onClick={addFaq}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors border border-white/5"
                >
                    <Plus size={13} />
                    Ajouter une fiche
                </button>
                {faqs.length > 0 && faqs.length < STARTER_FAQS.length && (
                    <button
                        onClick={loadStarters}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/15 text-xs text-purple-400 transition-colors border border-purple-500/20"
                    >
                        <Sparkles size={13} />
                        Compléter avec les modèles
                    </button>
                )}
                <Button
                    onPress={save}
                    isLoading={saving}
                    className="ml-auto bg-[var(--primary)] text-white text-xs font-bold px-4 rounded-xl"
                    size="sm"
                    startContent={!saving ? <Save size={13} /> : undefined}
                >
                    Sauvegarder
                </Button>
            </div>
        </div>
    );
}
