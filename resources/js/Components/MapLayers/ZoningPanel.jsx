import { useState, useMemo } from "react";

const ZONING_CATEGORIES = [
    {
        name: "Residential Zones",
        color: "#fffc2b",
        desc: "Allocated principally for dwelling and housing purposes to ensure healthy, safe, and livable neighborhoods.",
        items: [
            { code: "R1-Z", label: "Residential-1 Zone", color: "#fffc2b", density: "Low Density", buildLimit: "3 Stories (10m)", primaryUses: "Single-detached family dwellings, custom-built homes, and essential neighborhood facilities." },
            { code: "R2-Z", label: "Residential-2 Zone", color: "#fffc2b", density: "Medium Density", buildLimit: "5 Stories (15m)", primaryUses: "Duplexes, townhouses, and low-rise multi-family apartments." },
            { code: "MR2-SZ", label: "Maximum R-2 Sub-Zone", color: "#ffc92b", density: "Medium-High", buildLimit: "7+ Stories", primaryUses: "Multi-level residential buildings, condominiums, and densely packed rowhouses." },
            { code: "BR2-SZ", label: "Basic R-2 Sub-Zone", color: "#ffc92b", density: "Basic Medium", buildLimit: "3 Stories (10m)", primaryUses: "Standard socialized housing and government residential projects." },
        ]
    },
    {
        name: "Commercial Zones",
        color: "#eb3356",
        desc: "Areas designated for trade, retail, and business operations driving the local economy.",
        items: [
            { code: "C1-Z", label: "Commercial-1 Zone", color: "#eb3356", density: "Low-Medium", buildLimit: "3 Stories (10m)", primaryUses: "Neighborhood retail, local grocery shops, and basic daily services." },
            { code: "C2-Z", label: "Commercial-2 Zone", color: "#eb3356", density: "High Density", buildLimit: "6+ Stories", primaryUses: "Malls, corporate offices, banks, and major wholesale hubs." },
            { code: "C/MP-Z", label: "Cemetery/ Memorial Park Zone", color: "#36ff39", density: "Open Space", buildLimit: "1 Story", primaryUses: "Mausoleums, columbariums, memorial parks, and related administrative offices." },
        ]
    },
    {
        name: "Industrial & Agro-Industrial",
        color: "#de29c0",
        desc: "Zones for manufacturing, processing, and heavy commercial activities strictly regulated for environmental safety.",
        items: [
            { code: "I1-Z", label: "Industrial-1 Zone", color: "#de29c0", density: "Light Industrial", buildLimit: "Standard Factory", primaryUses: "Non-pollutive/non-hazardous manufacturing and warehouse storage." },
            { code: "I2-Z", label: "Industrial-2 Zone", color: "#de29c0", density: "Medium Industrial", buildLimit: "Regulated", primaryUses: "Pollutive/non-hazardous industries requiring specialized waste management." },
            { code: "I3-Z", label: "Industrial-3 Zone", color: "#de29c0", density: "Heavy Industrial", buildLimit: "Highly Regulated", primaryUses: "Highly pollutive/hazardous manufacturing (e.g., chemical processing)." },
            { code: "AgIndZ", label: "Agri-Industrial Zone", color: "#ff7cae", density: "Agri-Commercial", buildLimit: "Agricultural standard", primaryUses: "Processing of agricultural products, milling, and crop storage." },
            { code: "AgIndZ-PTR", label: "Agri-Industrial Zone Poultry", color: "#ff7cae", density: "Livestock", buildLimit: "Single Story", primaryUses: "Commercial poultry farms and related hatcheries." },
            { code: "AgIndZ-PGR", label: "Agri-Industrial Zone Piggery", color: "#ff7cae", density: "Livestock", buildLimit: "Single Story", primaryUses: "Commercial piggery operations with mandated biogas/waste treatment." },
        ]
    },
    {
        name: "Agricultural Sub-Zones",
        color: "#94d180",
        desc: "Vast tracts of land dedicated to cultivation, crop production, and ensuring food security.",
        items: [
            { code: "PDA-SZ", label: "Production Agricultural Sub-Zone", color: "#94d180", density: "Rural", buildLimit: "Farm structures only", primaryUses: "General crop production, orchards, and farming." },
            { code: "PTA-SZ-RA", label: "Protection Agricultural Rice Area", color: "#94d180", density: "Protected", buildLimit: "Strictly None", primaryUses: "Irrigated rice lands strictly protected from conversion." },
            { code: "5491-APDA-SZ", label: "Buffer/Greenbelt Zone", color: "#61631f", density: "Conservation", buildLimit: "None", primaryUses: "Natural buffers separating conflicting land uses or environmental hazards." },
        ]
    },
    {
        name: "Institutional & Utilities",
        color: "#6146db",
        desc: "Areas reserved for civic centers, public services, schools, and major infrastructure.",
        items: [
            { code: "GI-Z", label: "General Institutional Zone", color: "#6146db", density: "Public Use", buildLimit: "Varies by use", primaryUses: "Government centers, hospitals, schools, and religious structures." },
            { code: "UTS-Z", label: "Utility, Transportation, and Services", color: "#969696", density: "Infrastructure", buildLimit: "Functional max", primaryUses: "Power substations, water treatment plants, and transport terminals." },
            { code: "CMRF", label: "Central Materials Recovery Facility", color: "#969696", density: "Waste Management", buildLimit: "Functional max", primaryUses: "Municipal solid waste sorting, recycling, and composting." },
        ]
    },
    {
        name: "Forest, Parks & Water",
        color: "#5bb93c",
        desc: "Ecological zones for environmental preservation, public recreation, and natural resource management.",
        items: [
            { code: "FZ", label: "Forest Zone", color: "#5bb93c", density: "Protected", buildLimit: "Strictly None", primaryUses: "Natural forest preservation and wildlife protection." },
            { code: "FR-SZ", label: "Forest Reserve Sub-Zone", color: "#5bb93c", density: "Conservation", buildLimit: "Strictly None", primaryUses: "Watershed protection and critical ecological reserves." },
            { code: "PR-Z", label: "Parks and Recreation Zone", color: "#36ff39", density: "Open Space", buildLimit: "Ancillary only", primaryUses: "Public plazas, sports complexes, and community parks." },
            { code: "WZ", label: "Water Zone", color: "#2dcacd", density: "Aquatic", buildLimit: "None", primaryUses: "Rivers, lakes, and municipal waters protected for ecological balance." },
        ]
    },
    {
        name: "Special & Tourism",
        color: "#ffa97a",
        desc: "Designated corridors for tourism development and unique municipal landmarks.",
        items: [
            { code: "T-Z", label: "Tourism Zone", color: "#ffa97a", density: "Commercial-Leisure", buildLimit: "Regulated", primaryUses: "Resorts, hotels, and tourist-oriented commercial establishments." },
            { code: "ECT-Z", label: "Eco-Tourism Zone", color: "#ffa97a", density: "Low-Impact Leisure", buildLimit: "Eco-friendly constraints", primaryUses: "Nature parks, eco-lodges, and sustainable tourism activities." },
            { code: "THSP-SZ", label: "Tombol Hill Protection Sub-Zone", color: "#5bb93c", density: "Protected Landmark", buildLimit: "Strictly None", primaryUses: "Conservation of Tombol Hill's natural topography and historical significance." },
        ]
    }
];

export default function ZoningPanel() {
    const [zoningSearch, setZoningSearch] = useState("");
    const [selectedZoningTab, setSelectedZoningTab] = useState("All");
    const [activeZoneDetail, setActiveZoneDetail] = useState(null);

    const filteredZoningCategories = useMemo(() => {
        let cats = ZONING_CATEGORIES;
        if (selectedZoningTab !== "All") {
            cats = cats.filter(cat => cat.name.toLowerCase().includes(selectedZoningTab.toLowerCase()));
        }
        if (!zoningSearch.trim()) return cats;
        const q = zoningSearch.toLowerCase();
        return cats.map((cat) => ({
            ...cat,
            items: cat.items.filter(
                (it) => it.code.toLowerCase().includes(q) || it.label.toLowerCase().includes(q)
            ),
        })).filter((cat) => cat.items.length > 0);
    }, [zoningSearch, selectedZoningTab]);

    if (activeZoneDetail) {
        return (
            <div className="p-3.5 animate-in slide-in-from-right-4 duration-300">
                <button 
                    onClick={() => setActiveZoneDetail(null)}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-700 uppercase tracking-widest mb-4 transition-colors"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to List
                </button>

                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1.5" style={{ background: activeZoneDetail.color }} />
                    
                    <div className="flex items-start justify-between mb-4 mt-2">
                        <div>
                            <h3 className="text-sm font-black text-slate-800 leading-tight">
                                {activeZoneDetail.label}
                            </h3>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {activeZoneDetail.parentCategory}
                            </span>
                        </div>
                        <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 shadow-sm">
                            {activeZoneDetail.code}
                        </span>
                    </div>

                    <p className="text-xs text-slate-600 mb-5 leading-relaxed">
                        {activeZoneDetail.parentDesc}
                    </p>

                    <div className="space-y-3">
                        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                            <span className="block text-[9px] font-bold text-blue-500 uppercase tracking-widest mb-1">
                                Primary Allowable Uses
                            </span>
                            <span className="text-xs font-medium text-slate-700 leading-snug block">
                                {activeZoneDetail.primaryUses}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                    Density Type
                                </span>
                                <span className="text-xs font-bold text-slate-700">
                                    {activeZoneDetail.density}
                                </span>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                    Building Limit
                                </span>
                                <span className="text-xs font-bold text-slate-700">
                                    {activeZoneDetail.buildLimit}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-3.5 space-y-3 animate-in fade-in duration-300">
            <div className="relative">
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    placeholder="Search CLUP classifications..."
                    value={zoningSearch}
                    onChange={(e) => setZoningSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200/80 rounded-xl pl-9 pr-8 py-2 text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-sm"
                />
                {zoningSearch && (
                    <button onClick={() => setZoningSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {["All", "Residential", "Commercial", "Industrial", "Agricultural", "Institutional", "Special"].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setSelectedZoningTab(tab)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                            selectedZoningTab === tab ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50"
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="space-y-3 pb-4">
                {filteredZoningCategories.length === 0 ? (
                    <div className="py-8 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-slate-200/80">
                        <span className="text-2xl mb-2">🗺️</span>
                        <span className="text-xs font-bold text-slate-700">No Classification Found</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">Try adjusting your search terms.</span>
                    </div>
                ) : (
                    filteredZoningCategories.map((category) => (
                        <div key={category.name} className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-sm transition-all">
                            <div className="flex flex-col pb-2.5 mb-2 border-b border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ background: category.color }} />
                                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{category.name}</h4>
                                    </div>
                                    <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                        {category.items.length} ZONES
                                    </span>
                                </div>
                                <p className="text-[10px] text-slate-500 font-medium mt-1.5 leading-snug pl-4 border-l-2 border-slate-100 ml-1">
                                    {category.desc}
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                {category.items.map((item) => (
                                    <div
                                        key={item.code}
                                        onClick={() => setActiveZoneDetail({ ...item, parentCategory: category.name, parentDesc: category.desc })}
                                        className="group flex items-center justify-between text-xs p-2 rounded-xl border border-transparent hover:border-blue-100 hover:bg-blue-50/50 cursor-pointer transition-all"
                                    >
                                        <div className="flex flex-col min-w-0 pr-3">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="w-2 h-2 rounded-sm shrink-0 shadow-sm border border-black/10" style={{ background: item.color }} />
                                                <span className="font-bold text-slate-700 group-hover:text-blue-900 truncate transition-colors">{item.label}</span>
                                            </div>
                                            <span className="text-[9px] font-medium text-slate-400 pl-4 truncate group-hover:text-blue-600 transition-colors">
                                                {item.density} · {item.buildLimit}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 group-hover:bg-blue-200 group-hover:text-blue-800 transition-colors">
                                                {item.code}
                                            </span>
                                            <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}