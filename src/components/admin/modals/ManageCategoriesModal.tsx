"use client";

import React, { useState } from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    Tooltip
} from "@heroui/react";
import { Edit2, Trash2 } from "lucide-react";
import { deleteCategoryAction } from "@/app/admin/catalogue/actions";
import { toast } from "react-hot-toast";
import Image from "next/image";

interface Category {
    id: number;
    name: string;
    icon: string | null;
    imageUrl: string | null;
}

interface ManageCategoriesModalProps {
    isOpen: boolean;
    onClose: () => void;
    categories: Category[];
    onEdit: (category: Category) => void;
}

export const ManageCategoriesModal = ({ isOpen, onClose, categories, onEdit }: ManageCategoriesModalProps) => {
    const [isDeleting, setIsDeleting] = useState<number | null>(null);

    const handleDelete = async (id: number) => {
        if (!confirm("Êtes-vous sûr de vouloir supprimer cette catégorie ? Les produits associés ne seront pas supprimés mais n&apos;auront plus de catégorie.")) {
            return;
        }

        setIsDeleting(id);
        try {
            const res = await deleteCategoryAction({ id });
            if (res.success) {
                toast.success("Catégorie supprimée");
            } else {
                toast.error(res.error || "Erreur lors de la suppression");
            }
        } catch (err) {
            toast.error("Erreur de connexion");
        } finally {
            setIsDeleting(null);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="2xl"
            backdrop="blur"
            classNames={{
                base: "bg-[#161616] border border-[#262626] rounded-2xl shadow-2xl",
                header: "border-b border-[#262626] px-8 py-5",
                footer: "border-t border-[#262626] px-8 py-6",
            }}
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-[var(--primary)]">settings_suggest</span>
                            <h2 className="text-slate-100 text-lg font-bold">Gérer les Catégories</h2>
                        </ModalHeader>
                        <ModalBody className="p-0">
                            <Table
                                aria-label="Liste des catégories"
                                className="bg-transparent"
                                removeWrapper
                                classNames={{
                                    th: "bg-[#262626]/50 text-slate-500 font-black uppercase text-[10px] tracking-widest px-8 py-4",
                                    td: "px-8 py-4 text-slate-300 border-b border-[#262626]/50",
                                }}
                            >
                                <TableHeader>
                                    <TableColumn>CATÉGORIE</TableColumn>
                                    <TableColumn align="center">IMAGE</TableColumn>
                                    <TableColumn align="end">ACTIONS</TableColumn>
                                </TableHeader>
                                <TableBody>
                                    {categories.map((cat) => (
                                        <TableRow key={cat.id} className="hover:bg-white/5 transition-colors">
                                            <TableCell>
                                                <span className="font-bold text-sm tracking-tight">{cat.name}</span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex justify-center">
                                                    {cat.imageUrl ? (
                                                        <div className="size-10 rounded-lg overflow-hidden border border-white/5 relative">
                                                            <Image src={cat.imageUrl} alt={cat.name} className="object-cover" fill sizes="40px" />
                                                        </div>
                                                    ) : (
                                                        <div className="size-10 rounded-lg bg-[#262626] flex items-center justify-center border border-white/5">
                                                            <span className="material-symbols-outlined text-slate-500 text-lg">category</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex justify-end gap-3">
                                                    <Tooltip content="Modifier" color="primary">
                                                        <Button
                                                            isIconOnly
                                                            size="sm"
                                                            variant="flat"
                                                            className="bg-primary/10 text-primary hover:bg-primary hover:text-white"
                                                            onClick={() => onEdit(cat)}
                                                        >
                                                            <Edit2 size={16} />
                                                        </Button>
                                                    </Tooltip>
                                                    <Tooltip content="Supprimer" color="danger">
                                                        <Button
                                                            isIconOnly
                                                            size="sm"
                                                            variant="flat"
                                                            color="danger"
                                                            className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"
                                                            isLoading={isDeleting === cat.id}
                                                            onClick={() => handleDelete(cat.id)}
                                                        >
                                                            <Trash2 size={16} />
                                                        </Button>
                                                    </Tooltip>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {categories.length === 0 && (
                                <div className="py-12 text-center">
                                    <p className="text-slate-500 text-sm italic">Aucune catégorie trouvée.</p>
                                </div>
                            )}
                        </ModalBody>
                        <ModalFooter>
                            <Button variant="flat" onPress={onClose} className="bg-[#262626] text-white font-bold px-8">
                                Fermer
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};
