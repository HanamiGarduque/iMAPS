import { useEffect, useRef } from "react";
import axios from "axios";

// Looks up past records after typing pauses; only the latest request's rows reach onRows
export default function useDebouncedLookup(url, onRows) {
    const timer = useRef(null);
    const seq = useRef(0);
    const latestOnRows = useRef(onRows);
    latestOnRows.current = onRows;
    useEffect(() => () => clearTimeout(timer.current), []);

    return (val) => {
        clearTimeout(timer.current);
        const n = ++seq.current;
        const q = String(val || "").trim();
        if (q.length < 3) {
            latestOnRows.current([]);
            return;
        }
        timer.current = setTimeout(() => {
            axios
                .get(url, { params: { q } })
                .then(({ data }) => n === seq.current && latestOnRows.current(Array.isArray(data) ? data : []))
                .catch(() => n === seq.current && latestOnRows.current([]));
        }, 350);
    };
}
