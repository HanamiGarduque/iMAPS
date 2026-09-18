import React from "react";
import { DIVERSITY_LENSES } from "@/utils/diversityTheme";

// Map chrome for the diversity layer: which question the map is answering (the
// lens), and whether it answers it in 2D or 3D.
//
// Both maps render under this, so switching dimension never changes the
// question and switching the question never changes the dimension. Solid
// surfaces, no blur — these sit over map data and have to stay readable.
export default function DiversityControls({
    lens = "mix",
    onSelectLens = () => {},
    is3D = true,
    onToggle3D = () => {},
}) {
    return (
        // Sits directly under the layer selector rather than centred: "which
        // layer" and "which question" belong together, and centring would
        // collide with the layer toolbar on narrower screens.
        <div className="absolute top-[4.25rem] left-4 z-[700] pointer-events-auto flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">

            <div className="flex items-center bg-white border border-slate-300 rounded-md shadow-sm overflow-hidden">
                {DIVERSITY_LENSES.map((item, idx) => {
                    const isActive = lens === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectLens(item.id)}
                            className={`px-3 py-1.5 text-[11.5px] font-bold transition-colors cursor-pointer ${
                                idx > 0 ? "border-l border-slate-300" : ""
                            } ${
                                isActive
                                    ? "bg-slate-900 text-white"
                                    : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            }`}
                            title={item.question}
                        >
                            <span className="hidden md:inline whitespace-nowrap">{item.label}</span>
                            <span className="inline md:hidden whitespace-nowrap">{item.shortLabel}</span>
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center bg-white border border-slate-300 rounded-md shadow-sm overflow-hidden">
                {[
                    { id: false, label: "2D", title: "Flat choropleth — faster, and better for printed reports" },
                    { id: true, label: "3D", title: "Extruded massing model" },
                ].map((mode, idx) => {
                    const isActive = is3D === mode.id;
                    return (
                        <button
                            key={mode.label}
                            type="button"
                            onClick={() => onToggle3D(mode.id)}
                            className={`px-3 py-1.5 text-[11.5px] font-bold transition-colors cursor-pointer ${
                                idx > 0 ? "border-l border-slate-300" : ""
                            } ${
                                isActive
                                    ? "bg-slate-900 text-white"
                                    : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            }`}
                            title={mode.title}
                        >
                            {mode.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
