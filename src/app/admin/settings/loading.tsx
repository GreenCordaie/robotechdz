import { SkeletonBlock, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function SettingsLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonBlock key={i} className="h-10 w-28 rounded-2xl" />
                ))}
            </div>
            <div className="bg-white/5 rounded-2xl border border-white/5 p-6 animate-pulse space-y-5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                        <SkeletonBlock className="h-3 w-24" />
                        <SkeletonBlock className="h-11 w-full rounded-xl" />
                    </div>
                ))}
                <SkeletonBlock className="h-10 w-36 rounded-xl mt-4" />
            </div>
        </div>
    );
}
