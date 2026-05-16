import React from "react";
// Skeleton building blocks — reused by all admin loading.tsx files

export function SkeletonBlock({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
    return <div className={`bg-white/5 rounded-xl animate-pulse ${className}`} style={style} />;
}

export function SkeletonStat() {
    return (
        <div className="bg-white/5 rounded-2xl p-6 animate-pulse space-y-4 border border-white/5">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-8 w-16" />
            <SkeletonBlock className="h-2 w-32" />
        </div>
    );
}

export function SkeletonRow() {
    return (
        <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 animate-pulse">
            <SkeletonBlock className="h-8 w-8 rounded-lg shrink-0" />
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-4 w-24 ml-auto" />
            <SkeletonBlock className="h-4 w-16" />
            <SkeletonBlock className="h-8 w-20 rounded-full" />
        </div>
    );
}

export function SkeletonCard() {
    return (
        <div className="bg-white/5 rounded-2xl p-6 animate-pulse border border-white/5 space-y-4">
            <SkeletonBlock className="h-5 w-3/4" />
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="h-4 w-full" />
        </div>
    );
}

export function SkeletonPageHeader() {
    return (
        <div className="flex items-center justify-between mb-8 animate-pulse">
            <div className="space-y-3">
                <SkeletonBlock className="h-8 w-48" />
                <SkeletonBlock className="h-4 w-64" />
            </div>
            <SkeletonBlock className="h-11 w-32 rounded-xl" />
        </div>
    );
}
