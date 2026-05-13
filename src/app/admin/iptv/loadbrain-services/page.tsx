import { Suspense } from "react";
import LoadBrainServicesContent from "./LoadBrainServicesContent";

export const dynamic = "force-dynamic";

export default function Page() {
    return (
        <Suspense fallback={<LoadingState />}>
            <LoadBrainServicesContent />
        </Suspense>
    );
}

function LoadingState() {
    return (
        <div className="p-8">
            <div className="h-8 w-72 bg-[#161616] rounded animate-pulse mb-4" />
            <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-16 bg-[#161616] rounded animate-pulse" />
                ))}
            </div>
        </div>
    );
}
