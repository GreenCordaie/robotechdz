import { SkeletonBlock, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function SupportLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonBlock key={i} className="h-9 w-28 rounded-xl" />
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-white/5 rounded-2xl p-4 border border-white/5 animate-pulse space-y-3">
                        <div className="flex items-center justify-between">
                            <SkeletonBlock className="h-5 w-20 rounded-full" />
                            <SkeletonBlock className="h-3 w-16" />
                        </div>
                        <SkeletonBlock className="h-4 w-3/4" />
                        <SkeletonBlock className="h-3 w-full" />
                        <SkeletonBlock className="h-3 w-2/3" />
                        <div className="flex gap-2 pt-1">
                            <SkeletonBlock className="h-8 flex-1 rounded-lg" />
                            <SkeletonBlock className="h-8 w-8 rounded-lg" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
