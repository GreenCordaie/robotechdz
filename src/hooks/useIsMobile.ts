"use client";

import { useState, useEffect } from "react";

export function useIsMobile(breakpoint: number = 768) {
    const [isMobile, setIsMobile] = useState<boolean>(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < breakpoint);
        };

        // Initialize state
        checkMobile();

        // Listen for changes
        window.addEventListener("resize", checkMobile);

        return () => window.removeEventListener("resize", checkMobile);
    }, [breakpoint]);

    return isMobile;
}
