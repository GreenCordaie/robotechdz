import { SkeletonStat, SkeletonBlock, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function MonitoringLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-white/5 rounded-2xl p-4 border border-white/5 animate-pulse space-y-2">
                        <SkeletonBlock className="h-4 w-32" />
                        {Array.from({ length: 4 }).map((_, j) => (
                            <div key={j} className="flex justify-between">
                                <SkeletonBlock className="h-3 w-28" />
                                <SkeletonBlock className="h-3 w-16" />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
