import { SkeletonStat, SkeletonRow, SkeletonBlock, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function B2bLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => <SkeletonStat key={i} />)}
            </div>
            <SkeletonBlock className="h-11 w-full rounded-xl" />
            <div className="rounded-2xl border border-white/5 overflow-hidden">
                {Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
        </div>
    );
}
