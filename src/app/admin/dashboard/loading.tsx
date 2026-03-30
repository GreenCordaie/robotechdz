import { SkeletonStat, SkeletonBlock, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function DashboardLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-2xl p-5 border border-white/5 animate-pulse space-y-3">
                    <SkeletonBlock className="h-4 w-32" />
                    <div className="flex items-end gap-1 h-32">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <SkeletonBlock key={i} className="flex-1" style={{ height: `${30 + Math.random() * 70}%` } as any} />
                        ))}
                    </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-5 border border-white/5 animate-pulse space-y-3">
                    <SkeletonBlock className="h-4 w-32" />
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <SkeletonBlock className="h-8 w-8 rounded-lg" />
                            <SkeletonBlock className="h-3 flex-1" />
                            <SkeletonBlock className="h-3 w-16" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
