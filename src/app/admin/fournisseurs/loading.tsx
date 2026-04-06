import { SkeletonStat, SkeletonRow, SkeletonBlock, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function FournisseursLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => <SkeletonStat key={i} />)}
            </div>
            <div className="rounded-2xl border border-white/5 overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
        </div>
    );
}
