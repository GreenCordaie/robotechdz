"use client";

import React, { useState, useEffect } from "react";
import { Lock, Delete, ArrowRight, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/useAuthStore";
import { verifyPinAction } from "@/app/admin/login/actions";
import Image from "next/image";

export const LockScreen = () => {
    const [pin, setPin] = useState("");
    const [error, setError] = useState(false);
    const [isLocked, setIsLocked] = useState(true);

    const user = useAuthStore((state) => state.user);

    const handleNumberClick = (num: string) => {
        if (pin.length < 4) {
            setPin(prev => prev + num);
            setError(false);
        }
    };

    const handleDelete = () => {
        setPin(prev => prev.slice(0, -1));
        setError(false);
    };

    useEffect(() => {
        const verifyPin = async () => {
            if (pin.length === 4) {
                const result = await verifyPinAction(pin);
                if (result.success) {
                    setIsLocked(false);
                } else {
                    setError(true);
                    setTimeout(() => setPin(""), 500);
                }
            }
        };
        verifyPin();
    }, [pin]);

    if (!isLocked) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="fixed inset-0 z-[9999] bg-[#0a0a0a]/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 select-none"
            >
                {/* Header Profile */}
                <div className="flex flex-col items-center mb-12">
                    <div className="w-24 h-24 rounded-full bg-[#161616] border border-[#262626] flex items-center justify-center mb-4 relative">
                        <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-tr from-[#ec5b13]/20 to-transparent flex items-center justify-center relative">
                            <Image
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCZzSogzgSYWL4sV8cYS-i9sYM5fwva6Q0n4I55293IQmD03umRiums_O9xTBdasBU1_angHiWiAckgyWwn6UB9MBLipWMhFehIUd_Qc0NUCfkXrUB7xtX-66jetAhnxQNxVTRztumuzjGfV4latkz0g53wc7eiJUn89bYwLuPezAenuEtVe-t4k1298Xg1AQqPP6l314oAlSj3m3UMutiTNXAv4ywmJUO7cWO3xprkiMgliBjEdbhP9gqPQREeem3Jv00wZuEZHdbM"
                                alt="Admin"
                                className="object-cover opacity-80"
                                fill
                            />
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-[#ec5b13] p-1.5 rounded-full shadow-lg">
                            <Lock className="w-3 h-3 text-white" />
                        </div>
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight">{user?.nom || "Administrateur"}</h2>
                    <p className="text-slate-500 text-sm mt-1">Session verrouillée</p>
                </div>

                {/* PIN Display */}
                <div className="flex gap-4 mb-12">
                    {[0, 1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${pin[i]
                                ? "bg-[#ec5b13] border-[#ec5b13] scale-110 shadow-[0_0_15px_rgba(236,91,19,0.5)]"
                                : "border-[#262626]"
                                } ${error ? "animate-shake bg-red-500 border-red-500" : ""}`}
                        />
                    ))}
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-6 max-w-xs w-full">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                        <button
                            key={num}
                            onClick={() => handleNumberClick(num)}
                            className="w-20 h-20 rounded-full bg-[#161616] border border-[#262626] text-2xl font-bold text-white hover:bg-[#262626] active:scale-90 transition-all flex items-center justify-center outline-none"
                        >
                            {num}
                        </button>
                    ))}
                    <div /> {/* Empty space */}
                    <button
                        onClick={() => handleNumberClick("0")}
                        className="w-20 h-20 rounded-full bg-[#161616] border border-[#262626] text-2xl font-bold text-white hover:bg-[#262626] active:scale-90 transition-all flex items-center justify-center outline-none"
                    >
                        0
                    </button>
                    <button
                        onClick={handleDelete}
                        className="w-20 h-20 rounded-full flex items-center justify-center text-slate-400 hover:text-white active:scale-90 transition-all outline-none"
                    >
                        <Delete className="w-8 h-8" />
                    </button>
                </div>

                {/* Bottom Action */}
                <button
                    onClick={() => window.location.href = "/admin/login"}
                    className="mt-12 text-slate-500 hover:text-[#ec5b13] text-sm font-medium transition-colors flex items-center gap-2"
                >
                    Changer de compte <ArrowRight className="w-4 h-4" />
                </button>

                <style jsx>{`
                    @keyframes shake {
                        0%, 100% { transform: translateX(0); }
                        25% { transform: translateX(-5px); }
                        75% { transform: translateX(5px); }
                    }
                    .animate-shake {
                        animation: shake 0.2s ease-in-out infinite;
                    }
                `}</style>
            </motion.div>
        </AnimatePresence>
    );
};
