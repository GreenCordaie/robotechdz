import { SkeletonStat, SkeletonBlock, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function AnalyticsLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)}
            </div>
            <div className="bg-white/5 rounded-2xl p-5 border border-white/5 animate-pulse space-y-4">
                <SkeletonBlock className="h-4 w-40" />
                <div className="flex items-end gap-2 h-40">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <SkeletonBlock key={i} className="flex-1 rounded-lg" style={{ height: `${40 + Math.random() * 60}%` } as any} />
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                        <SkeletonBlock className="h-9 w-9 rounded-xl" />
                        <div className="flex-1 space-y-1.5">
                            <SkeletonBlock className="h-3 w-3/4" />
                            <SkeletonBlock className="h-2 w-1/2" />
                        </div>
                        <SkeletonBlock className="h-5 w-16 rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}
