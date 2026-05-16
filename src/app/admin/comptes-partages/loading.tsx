import { SkeletonBlock, SkeletonCard, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function ComptesPartagesLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="flex gap-2">
                {Array.from({ length: 2 }).map((_, i) => (
                    <SkeletonBlock key={i} className="h-10 w-32 rounded-2xl" />
                ))}
            </div>
            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-white/5 rounded-2xl border border-white/5 animate-pulse p-4 space-y-3">
                        <div className="flex items-center gap-3">
                            <SkeletonBlock className="h-4 w-48" />
                            <SkeletonBlock className="h-5 w-16 rounded-full" />
                            <SkeletonBlock className="h-2 w-24 ml-auto rounded-full" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {Array.from({ length: 4 }).map((_, j) => (
                                <SkeletonCard key={j} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
