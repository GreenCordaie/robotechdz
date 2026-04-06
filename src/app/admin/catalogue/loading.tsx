import { SkeletonBlock, SkeletonCard, SkeletonPageHeader } from "@/components/admin/PageSkeleton";

export default function CatalogueLoading() {
    return (
        <div className="p-6 space-y-6">
            <SkeletonPageHeader />
            <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonBlock key={i} className="h-9 w-24 rounded-xl" />
                ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
        </div>
    );
}
