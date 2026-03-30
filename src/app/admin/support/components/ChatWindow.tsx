"use client";

import React, { useState, useRef, useEffect } from "react";
import { formatWhatsApp } from "@/lib/formatters";
import { Send, User, Loader2, Info } from "lucide-react";
import { Button, Input } from "@heroui/react";
import ChatBubble from "./ChatBubble";
import { sendSupportMessageAction } from "../actions";
import { toast } from "react-hot-toast";

interface Message {
    id: string;
    text: string;
    fromMe: boolean;
    timestamp: Date | string;
    type: 'WHATSAPP' | 'TICKET';
    status?: 'sent' | 'delivered' | 'read' | 'failed';
}

interface ChatWindowProps {
    phone: string | null;
    clientName: string | null;
    messages: Message[];
    isLoading: boolean;
    onMessageSent: () => void;
    onTypingChange?: (isTyping: boolean) => void;
}

const ChatWindow = ({ phone, clientName, messages: propMessages, isLoading, onMessageSent, onTypingChange }: ChatWindowProps) => {
    const [newMessage, setNewMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [localMessages, setLocalMessages] = useState<Message[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Sync local state with props when they change, but PRESERVE OPTIMISTIC MESSAGES & PREVENT DUPLICATES
    useEffect(() => {
        setLocalMessages(prev => {
            // Get all real messages from props
            const newMessages = [...propMessages];

            // Get optimistic messages from current local state
            const optimisticItems = prev.filter(m => m.id.toString().startsWith("temp_"));

            // For each optimistic message, check if its content already exists in propMessages
            // as a 'fromMe' message sent recently.
            const filteredOptimistic = optimisticItems.filter(opt => {
                const alreadyExists = propMessages.some(real =>
                    real.fromMe &&
                    real.text === opt.text
                    // Optional: check timestamp proximity if text is too common
                );
                return !alreadyExists;
            });

            // Merge props + remaining optimistic
            const merged = [...newMessages, ...filteredOptimistic];

            // Sort by true timestamp
            return merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        });
    }, [propMessages]);

    // Smart scrolling logic
    const scrollToBottom = (force = false) => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

        if (force || isNearBottom) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        // Force scroll on initial load (when messages first arrive)
        if (localMessages.length > 0 && !isSending) {
            const lastMsg = localMessages[localMessages.length - 1];
            // Scroll to bottom ONLY IF:
            // 1. We just loaded the first batch (length transition)
            // 2. OR the last message is from ME (I just sent a reply)
            // 3. OR the user was already near bottom
            const isFromMe = lastMsg?.fromMe || false;

            if (isFromMe) {
                scrollToBottom(true);
            } else {
                // Background update: only scroll if user was already at the bottom
                scrollToBottom(false);
            }
        }
    }, [localMessages.length]);

    useEffect(() => {
        if (isSending) scrollToBottom(true);
    }, [isSending]);

    const handleSend = async () => {
        if (!phone || !newMessage.trim() || isSending) return;

        const messageText = newMessage.trim();
        const tempId = `temp_${Date.now()}`;

        // OPTIMISTIC UPDATE: Add message to UI immediately
        const optimisticMsg: Message = {
            id: tempId,
            text: messageText,
            fromMe: true,
            timestamp: new Date(),
            type: 'WHATSAPP'
        };

        setLocalMessages(prev => [...prev, optimisticMsg]);
        setNewMessage("");
        setIsSending(true);

        try {
            const res: any = await sendSupportMessageAction({ phone, message: messageText });
            if (res.success) {
                // Trigger parent re-fetch, which will eventually sync back to localMessages
                onMessageSent();
            } else {
                toast.error(res.error || "Erreur d'envoi");
                // Remove the failed message
                setLocalMessages(prev => prev.filter(m => m.id !== tempId));
                setNewMessage(messageText); // Restore input
            }
        } catch (error) {
            toast.error("Échec de la connexion");
            setLocalMessages(prev => prev.filter(m => m.id !== tempId));
            setNewMessage(messageText);
        } finally {
            setIsSending(false);
        }
    };

    if (!phone) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-black/20 rounded-[24px] border border-dashed border-white/5 opacity-40">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Info size={40} className="text-slate-600" />
                </div>
                <p className="text-sm font-black uppercase tracking-widest">Sélectionnez une discussion</p>
                <p className="text-[10px] uppercase font-bold text-slate-500 mt-2">pour commencer à répondre</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-[#1a1614] border border-white/5 rounded-[24px] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-white/[0.03] flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--primary)]/20 flex items-center justify-center">
                    <User size={20} className="text-[var(--primary)]" />
                </div>
                <div>
                    <h4 className="text-sm font-black text-white">{clientName || formatWhatsApp(phone)}</h4>
                    <p className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider">{formatWhatsApp(phone)}</p>
                </div>
            </div>

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#120f0e] no-scrollbar"
            >
                {isLoading && localMessages.length === 0 ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="animate-spin text-[var(--primary)]" />
                    </div>
                ) : localMessages.length === 0 ? (
                    <div className="text-center py-10 opacity-30 italic text-xs">
                        Aucun message historique
                    </div>
                ) : (
                    localMessages.map((msg: Message) => (
                        <ChatBubble
                            key={msg.id}
                            text={msg.text}
                            fromMe={msg.fromMe}
                            timestamp={msg.timestamp}
                            type={msg.type}
                            status={msg.status}
                        />
                    ))
                )}
            </div>

            {/* Input */}
            <div className="p-4 bg-white/[0.02] border-t border-white/5">
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                    className="flex gap-2"
                >
                    <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onFocus={() => onTypingChange?.(true)}
                        onBlur={() => onTypingChange?.(false)}
                        placeholder="Tapez votre réponse..."
                        variant="flat"
                        className="flex-1"
                        classNames={{
                            inputWrapper: "bg-white/5 border-white/5 group-data-[focus=true]:border-[var(--primary)]/50 rounded-xl",
                            input: "text-sm text-white"
                        }}
                    />
                    <Button
                        isIconOnly
                        type="submit"
                        disabled={!newMessage.trim() || isSending}
                        className="bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/20 rounded-xl"
                    >
                        {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={18} />}
                    </Button>
                </form>
            </div>
        </div>
    );
}
export default React.memo(ChatWindow);
