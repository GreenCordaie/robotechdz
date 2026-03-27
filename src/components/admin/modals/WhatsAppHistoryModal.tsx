"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, Spinner, Chip } from "@heroui/react";
import { getClientWhatsAppHistory } from "@/app/admin/clients/actions";
import { formatWhatsApp } from "@/lib/formatters";

interface Message {
    id: number;
    fromMe: boolean;
    body: string;
    messageType: string;
    timestamp: string | Date | null;
}

interface Ticket {
    id: number;
    subject: string;
    status: string;
    createdAt: string | Date | null;
    customerPhone: string;
}

interface WhatsAppHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    clientId: number;
    clientName: string;
    clientPhone: string;
}

function formatTime(ts: string | Date | null) {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString("fr-DZ", { day: "2-digit", month: "2-digit" }) +
        " " + d.toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" });
}

const WhatsAppIcon = () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.438 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
);

export default function WhatsAppHistoryModal({
    isOpen,
    onClose,
    clientId,
    clientName,
    clientPhone,
}: WhatsAppHistoryModalProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen || !clientId) return;
        setIsLoading(true);
        setError(null);
        setMessages([]);
        setTickets([]);

        getClientWhatsAppHistory({ clientId }).then(res => {
            if (res.success && res.data) {
                setMessages(res.data.messages as Message[]);
                setTickets(res.data.tickets as Ticket[]);
            } else {
                setError((res as any).error || "Erreur lors du chargement");
            }
        }).finally(() => setIsLoading(false));
    }, [isOpen, clientId]);

    useEffect(() => {
        if (messages.length > 0) {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const ticketStatusColor = (status: string) => {
        if (status === "OUVERT") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
        if (status === "TRAITE") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
        return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            scrollBehavior="inside"
            classNames={{
                base: "bg-[#0f0f0f] border border-[#262626] text-white max-h-[85vh]",
                header: "border-b border-[#262626] pb-3",
                body: "p-0",
            }}
        >
            <ModalContent>
                <ModalHeader className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                        <span className="text-[#25D366]"><WhatsAppIcon /></span>
                        <span className="text-sm font-black uppercase tracking-widest text-white">
                            WhatsApp — {clientName}
                        </span>
                        {messages.length > 0 && (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20">
                                {messages.length} messages
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">{formatWhatsApp(clientPhone)}</p>
                </ModalHeader>

                <ModalBody>
                    {/* Chat zone */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[300px] max-h-[450px]">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-40">
                                <Spinner color="success" />
                            </div>
                        ) : error ? (
                            <div className="flex items-center justify-center h-40 text-red-400 text-sm">
                                {error}
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-500">
                                <WhatsAppIcon />
                                <p className="text-sm">Aucune conversation WhatsApp trouvée</p>
                            </div>
                        ) : (
                            <>
                                {messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}
                                    >
                                        <div className={`max-w-[75%] flex flex-col gap-0.5 ${msg.fromMe ? "items-end" : "items-start"}`}>
                                            {msg.fromMe && (
                                                <span className="text-[9px] font-black uppercase text-[#ec5b13]/60 px-1">Bot</span>
                                            )}
                                            <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${msg.fromMe
                                                    ? "bg-[#ec5b13]/20 text-orange-100 rounded-tr-sm"
                                                    : "bg-[#262626] text-slate-200 rounded-tl-sm"
                                                }`}>
                                                {msg.messageType !== "text"
                                                    ? <span className="italic text-slate-400">[{msg.messageType === "image" ? "Image" : msg.messageType === "audio" ? "Audio" : "Fichier"}]</span>
                                                    : msg.body
                                                }
                                            </div>
                                            <span className="text-[9px] text-slate-600 px-1">
                                                {formatTime(msg.timestamp)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                <div ref={bottomRef} />
                            </>
                        )}
                    </div>

                    {/* Tickets liés */}
                    {tickets.length > 0 && (
                        <div className="border-t border-[#262626] px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                Tickets support liés
                            </p>
                            <div className="space-y-1.5">
                                {tickets.map(ticket => (
                                    <div key={ticket.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#161616] border border-[#262626]">
                                        <p className="text-xs text-slate-300 truncate flex-1">{ticket.subject}</p>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[9px] text-slate-500">
                                                {formatTime(ticket.createdAt)}
                                            </span>
                                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full border ${ticketStatusColor(ticket.status)}`}>
                                                {ticket.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
