"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Clock, Ticket, Check, CheckCheck, AlertCircle } from "lucide-react";

interface ChatBubbleProps {
    text: string;
    fromMe: boolean;
    timestamp: Date | string;
    type?: 'WHATSAPP' | 'TICKET';
    status?: 'sent' | 'delivered' | 'read' | 'failed';
}

export default function ChatBubble({ text, fromMe, timestamp, type = 'WHATSAPP', status }: ChatBubbleProps) {
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });

    const StatusIcon = () => {
        if (!fromMe || type === 'TICKET') return null;

        switch (status) {
            case 'read':
                return <CheckCheck size={12} className="text-blue-400" />;
            case 'delivered':
                return <CheckCheck size={12} className="text-white/40" />;
            case 'failed':
                return <AlertCircle size={12} className="text-red-500" />;
            case 'sent':
            default:
                return <Check size={12} className="text-white/40" />;
        }
    };

    return (
        <div className={cn(
            "flex w-full mb-2",
            fromMe ? "justify-end" : "justify-start"
        )}>
            <div className={cn(
                "max-w-[85%] md:max-w-[70%] px-4 py-2 rounded-2xl shadow-sm relative group",
                fromMe
                    ? "bg-[var(--primary)] text-white rounded-tr-none"
                    : "bg-[#2a2420] text-slate-200 rounded-tl-none border border-white/5",
                type === 'TICKET' && !fromMe && "border-l-4 border-l-warning"
            )}>
                {type === 'TICKET' && (
                    <div className="flex items-center gap-1.5 mb-1 opacity-60">
                        <Ticket size={10} />
                        <span className="text-[9px] font-black uppercase tracking-tighter">Ticket Support</span>
                    </div>
                )}

                <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>

                <div className={cn(
                    "flex items-center justify-end gap-1 mt-1 opacity-50",
                    fromMe ? "text-white/80" : "text-slate-500"
                )}>
                    <span className="text-[10px] font-medium">{timeStr}</span>
                    <StatusIcon />
                </div>
            </div>
        </div>
    );
}
