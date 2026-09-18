import { useEffect, useState } from "react";

// Municipal workstations are often configured for reduced motion (and some
// staff get motion sick from the 3D camera flights). Every camera move and
// entrance animation in the diversity layer checks this before animating.
export default function useReducedMotion() {
    const [prefersReduced, setPrefersReduced] = useState(() => {
        if (typeof window === "undefined" || !window.matchMedia) return false;
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    });

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const handler = (e) => setPrefersReduced(e.matches);

        // Safari < 14 only supports the deprecated listener API.
        if (mq.addEventListener) {
            mq.addEventListener("change", handler);
            return () => mq.removeEventListener("change", handler);
        }
        mq.addListener(handler);
        return () => mq.removeListener(handler);
    }, []);

    return prefersReduced;
}
