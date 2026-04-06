import { SkeletonBlock, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function TraitementLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Array.from({ length: 2 }).map((_, col) => (
                    <div key={col} className="space-y-3">
                        <SkeletonBlock className="h-5 w-32" />
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="bg-white/5 rounded-2xl p-4 border border-white/5 animate-pulse space-y-2">
                                <div className="flex justify-between">
                                    <SkeletonBlock className="h-4 w-24" />
                                    <SkeletonBlock className="h-5 w-16 rounded-full" />
                                </div>
                                <SkeletonBlock className="h-3 w-3/4" />
                                <SkeletonBlock className="h-8 w-full rounded-xl mt-2" />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
