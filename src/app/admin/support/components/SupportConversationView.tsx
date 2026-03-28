"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import DiscussionList from "./DiscussionList";
import ChatWindow from "./ChatWindow";
import { getConversationsAction, getConversationMessagesAction } from "../actions";
import { toast } from "react-hot-toast";

interface SupportConversationViewProps {
    selectedPhone: string | null;
    onSelect: (phone: string | null) => void;
}

const SupportConversationView = ({ selectedPhone, onSelect }: SupportConversationViewProps) => {
    const [discussions, setDiscussions] = useState<any[]>([]);
    const [messages, setMessages] = useState<any[]>([]);
    const [isDiscussionsLoading, setIsDiscussionsLoading] = useState(true);
    const [isMessagesLoading, setIsMessagesLoading] = useState(false);

    // Safety Refs
    const isPollingRef = useRef(false);
    const isUserTypingRef = useRef(false);

    const loadDiscussions = useCallback(async (isInitial = false) => {
        if (isPollingRef.current && !isInitial) return;
        isPollingRef.current = true;
        try {
            const data = await getConversationsAction({});
            if (Array.isArray(data)) {
                setDiscussions(prev => {
                    // Optimized check: only update if length or last message timestamps changed
                    if (prev.length === data.length) {
                        const isMatch = prev.every((d, i) =>
                            d.phone === data[i].phone &&
                            d.lastMessageAt === data[i].lastMessageAt &&
                            d.status === data[i].status
                        );
                        if (isMatch) return prev;
                    }
                    return data;
                });
            }
        } catch (error) {
            console.error("Failed to load discussions");
        } finally {
            setIsDiscussionsLoading(false);
            isPollingRef.current = false;
        }
    }, []);

    const loadMessages = useCallback(async (phone: string, isInitial = false) => {
        if (isUserTypingRef.current && !isInitial) return;
        if (isInitial) setIsMessagesLoading(true);
        try {
            const data = await getConversationMessagesAction(phone);
            if (Array.isArray(data)) {
                setMessages(prev => {
                    // Deep comparison for messages to prevent re-renders
                    if (prev.length === data.length) {
                        const isMatch = prev.every((m, i) => m.id === data[i].id && m.text === data[i].text);
                        if (isMatch) return prev;
                    }
                    return data;
                });
            }
        } catch (error) {
            if (isInitial) toast.error("Échec du chargement des messages");
        } finally {
            if (isInitial) setIsMessagesLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        loadDiscussions(true);
    }, [loadDiscussions]);

    useEffect(() => {
        if (selectedPhone) {
            loadMessages(selectedPhone, true);
            // Mark as read and refresh discussions to clear notifications
            import("../actions").then(m => {
                m.markConversationAsReadAction(selectedPhone).then(() => {
                    loadDiscussions();
                });
            });
        } else {
            setMessages([]);
        }
    }, [selectedPhone, loadMessages, loadDiscussions]);

    // Poll for discussions
    useEffect(() => {
        let timer: NodeJS.Timeout;
        const poll = async () => {
            if (!document.hidden && !isUserTypingRef.current) {
                await loadDiscussions();
            }
            timer = setTimeout(poll, 15000);
        };
        poll();
        return () => clearTimeout(timer);
    }, [loadDiscussions]);

    // Poll for messages in active chat
    useEffect(() => {
        if (!selectedPhone) return;

        let timer: NodeJS.Timeout;
        const poll = async () => {
            if (!document.hidden && !isUserTypingRef.current && selectedPhone) {
                await loadMessages(selectedPhone, false);
            }
            timer = setTimeout(poll, 10000);
        };
        poll();
        return () => clearTimeout(timer);
    }, [selectedPhone, loadMessages]);

    const selectedDiscussion = discussions.find(d => d.phone === selectedPhone);

    return (
        <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-250px)] min-h-[600px]">
            <div className="w-full md:w-80 h-full flex flex-col gap-3">
                <DiscussionList
                    discussions={discussions}
                    selectedPhone={selectedPhone}
                    onSelect={onSelect}
                />
            </div>

            <ChatWindow
                phone={selectedPhone}
                clientName={selectedDiscussion?.clientName || null}
                messages={messages}
                isLoading={isMessagesLoading}
                onMessageSent={() => selectedPhone && loadMessages(selectedPhone, true)}
                onTypingChange={(isTyping) => { isUserTypingRef.current = isTyping; }}
            />
        </div>
    );
}
export default React.memo(SupportConversationView);
