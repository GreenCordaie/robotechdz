import { SkeletonRow, SkeletonBlock, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function CommandesLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <SkeletonBlock className="h-11 w-full rounded-xl" />
            <div className="rounded-2xl border border-white/5 overflow-hidden">
                <div className="flex gap-4 px-4 py-3 border-b border-white/5 animate-pulse">
                    {["w-20", "w-32", "w-24", "w-20", "w-28", "w-16"].map((w, i) => (
                        <SkeletonBlock key={i} className={`h-3 ${w}`} />
                    ))}
                </div>
                {Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
        </div>
    );
}
