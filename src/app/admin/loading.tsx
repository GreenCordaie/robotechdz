import { SkeletonBlock, SkeletonPageHeader, SkeletonRow } from "@/components/admin/PageSkeleton";

export default function AdminLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
        </div>
    );
}
