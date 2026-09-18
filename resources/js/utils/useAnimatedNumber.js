import { useEffect, useRef, useState } from "react";
import useReducedMotion from "./useReducedMotion";

// Tweens a displayed number from its previous value to a new one, instead of
// the digits just popping to the new figure. Hand-rolled rather than a
// dependency, matching how the rest of this app already animates its map
// camera and orbit by hand rather than reaching for a library.
//
// Only the NUMBER ticks — callers should keep deriving colour and
// classification from the real target value, not from the tweened
// intermediate, or a badge would flicker through bands it never actually
// belongs to as the digits count through them.
export default function useAnimatedNumber(target, { duration = 450 } = {}) {
    const reducedMotion = useReducedMotion();
    const [value, setValue] = useState(target);
    const fromRef = useRef(target);
    const rafRef = useRef(null);

    useEffect(() => {
        if (reducedMotion || typeof target !== "number" || Number.isNaN(target)) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            setValue(target);
            fromRef.current = target;
            return;
        }

        const from = fromRef.current;
        if (from === target) return;

        const start = performance.now();
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        const step = (now) => {
            const t = Math.min(1, (now - start) / duration);
            setValue(from + (target - from) * easeOutCubic(t));
            if (t < 1) {
                rafRef.current = requestAnimationFrame(step);
            } else {
                fromRef.current = target;
            }
        };

        rafRef.current = requestAnimationFrame(step);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [target, duration, reducedMotion]);

    return value;
}
