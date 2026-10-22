import { useEffect, useState } from "react";
import { loadBarangayBoundaries, resolveBarangayName } from "@/utils/mapData";

// The barangays that are on the map (48), not every spelling the stats table
// has met, which would inflate "of N".
export default function useBarangayNames() {
    const [names, setNames] = useState([]);
    useEffect(() => {
        let live = true;
        loadBarangayBoundaries().then((geo) => {
            if (live && geo?.features) setNames([...new Set(geo.features.map((f) => resolveBarangayName(f.properties)).filter(Boolean))]);
        });
        return () => { live = false; };
    }, []);
    return names;
}
