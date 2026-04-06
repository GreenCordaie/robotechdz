"use client";

import React from "react";
import { formatWhatsApp } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { MessageSquare, User, Clock } from "lucide-react";

interface Discussion {
    phone: string;
    clientName: string | null;
    lastMessageAt: Date | string;
    lastMessageText: string;
    status: 'OUVERT' | 'RESOLU';
    unreadCount: number;
}

interface DiscussionListProps {
    discussions: Discussion[];
    selectedPhone: string | null;
    onSelect: (phone: string) => void;
}

const DiscussionList = ({ discussions, selectedPhone, onSelect }: DiscussionListProps) => {
    return (
        <div className="flex flex-col h-full bg-[#1a1614] border border-white/5 rounded-[24px] overflow-hidden shadow-xl">
            <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Conversations</h3>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar">
                {discussions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-30">
                        <MessageSquare size={32} className="mb-2" />
                        <p className="text-[10px] font-bold uppercase">Aucune discussion</p>
                    </div>
                ) : (
                    discussions.map((disc) => (
                        <button
                            key={disc.phone}
                            onClick={() => onSelect(disc.phone)}
                            className={cn(
                                "w-full p-4 flex gap-3 items-start border-b border-white/5 transition-all text-left",
                                selectedPhone === disc.phone
                                    ? "bg-[var(--primary)]/10 border-l-4 border-l-[var(--primary)]"
                                    : "hover:bg-white/[0.02] border-l-4 border-l-transparent"
                            )}
                        >
                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                                <User size={18} className={disc.clientName ? "text-[var(--primary)]" : "text-slate-600"} />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-sm font-black text-white truncate">
                                        {disc.clientName || formatWhatsApp(disc.phone)}
                                    </span>
                                    <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                                        <Clock size={10} />
                                        {new Date(disc.lastMessageAt).toLocaleDateString("fr-FR", { day: '2-digit', month: '2-digit' })}
                                    </span>
                                </div>

                                {disc.clientName && (
                                    <div className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider mb-1">
                                        {formatWhatsApp(disc.phone)}
                                    </div>
                                )}

                                <p className="text-xs text-slate-500 truncate leading-tight">
                                    {disc.lastMessageText}
                                </p>
                            </div>

                            <div className="flex flex-col items-end gap-1 self-start mt-1">
                                {disc.unreadCount > 0 ? (
                                    <div className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[var(--primary)] px-1 shadow-[0_0_8px_rgba(236,91,19,0.4)]">
                                        <span className="text-[9px] font-black text-white leading-none">{disc.unreadCount}</span>
                                    </div>
                                ) : disc.status === 'OUVERT' && (
                                    <div className="w-2 h-2 rounded-full bg-white/10" />
                                )}
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}

export default React.memo(DiscussionList);
