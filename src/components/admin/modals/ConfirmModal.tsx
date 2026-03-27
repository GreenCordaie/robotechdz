"use client";

import React from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button
} from "@heroui/react";
import { AlertCircle, Trash2, Archive, RotateCcw, AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "info" | "success";
    isLoading?: boolean;
}

export const ConfirmModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel = "Confirmer",
    cancelLabel = "Annuler",
    variant = "danger",
    isLoading = false
}: ConfirmModalProps) => {
    const getIcon = () => {
        switch (variant) {
            case "danger": return <Trash2 className="text-red-500 size-6" />;
            case "warning": return <AlertTriangle className="text-amber-500 size-6" />;
            case "info": return <AlertCircle className="text-blue-500 size-6" />;
            case "success": return <RotateCcw className="text-emerald-500 size-6" />;
            default: return <AlertCircle className="size-6" />;
        }
    };

    const getConfirmColor = () => {
        switch (variant) {
            case "danger": return "danger";
            case "warning": return "warning";
            case "info": return "primary";
            case "success": return "success";
            default: return "danger";
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            classNames={{
                base: "bg-[#1a1614] border border-[#2d2622] rounded-2xl",
                header: "border-b border-[#2d2622] text-white",
                footer: "border-t border-[#2d2622]",
                closeButton: "hover:bg-white/5 active:scale-95 transition-all text-slate-400"
            }}
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex gap-3 items-center">
                            {getIcon()}
                            <span className="font-bold">{title}</span>
                        </ModalHeader>
                        <ModalBody className="py-6">
                            <p className="text-slate-400 text-sm leading-relaxed">
                                {description}
                            </p>
                        </ModalBody>
                        <ModalFooter>
                            <Button
                                variant="flat"
                                onPress={onClose}
                                className="bg-[#2d2622] text-slate-300 font-bold hover:bg-[#3d3632]"
                            >
                                {cancelLabel}
                            </Button>
                            <Button
                                color={getConfirmColor() as any}
                                onPress={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                isLoading={isLoading}
                                className="font-black uppercase tracking-widest text-[10px]"
                            >
                                {confirmLabel}
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};
