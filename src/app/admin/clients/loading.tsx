import { SkeletonStat, SkeletonRow, SkeletonBlock, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function ClientsLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)}
            </div>
            <SkeletonBlock className="h-11 w-full rounded-xl" />
            <div className="rounded-2xl border border-white/5 overflow-hidden">
                <div className="flex gap-4 px-4 py-3 border-b border-white/5 animate-pulse">
                    {["w-32", "w-24", "w-20", "w-28", "w-16"].map((w, i) => (
                        <SkeletonBlock key={i} className={`h-3 ${w}`} />
                    ))}
                </div>
                {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
        </div>
    );
}
