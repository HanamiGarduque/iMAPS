import React, { useState, useEffect, useRef } from "react";
import { Head, router } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";

export default function Settings({ auth }) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Administrator";

    // Form States
    const [uploadLayer, setUploadLayer] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);

    const [mapSettings, setMapSettings] = useState({
        defaultCenter: "13.8450, 121.2060", // Defaulting to Rosario, Batangas
        defaultZoom: "13",
        baseMap: "satellite",
        crs: "EPSG:4326"
    });

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(
                now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) +
                " · " +
                now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })
            );
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    const handleLogout = () => {
        if (confirm("Sign out from iMAPS?")) router.post("/logout");
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && file.name.endsWith('.zip')) {
            setSelectedFile(file);
        } else {
            alert("Please upload a valid .zip file containing your shapefile bundle.");
            e.target.value = null;
        }
    };

    const handleUploadSubmit = (e) => {
    e.preventDefault();
    if (!uploadLayer || !selectedFile) {
        alert("Please select a layer type and choose a file.");
        return;
    }
    
    // Create the form data payload
    const formData = new FormData();
    formData.append('layer_type', uploadLayer);
    formData.append('shapefile_zip', selectedFile);
    
    // Send it to your Laravel backend
    router.post('/settings/upload-shapefile', formData, {
        onSuccess: () => {
            setSelectedFile(null);
            setUploadLayer("");
            alert("Shapefile successfully updated in the database!");
        },
        onError: (errors) => {
            alert(errors.shapefile_zip || errors.layer_type || "An error occurred during upload.");
        }
    });
};

    const handleSaveMapSettings = (e) => {
        e.preventDefault();
        console.log("Saving Map Settings:", mapSettings);
        alert("Map settings saved.");
    };

    return (
        <>
            <Head title="System Settings | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500;700&display=swap');
                #dashboard-root, #dashboard-root :not(.font-mono) { font-family: 'Poppins', sans-serif !important; }
                #dashboard-root .font-mono, #dashboard-root .font-mono * { font-family: 'DM Mono', monospace !important; }
                
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                
                .form-enter { animation: formFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes formFadeIn { 0% { opacity: 0; transform: translateY(5px); } 100% { opacity: 1; transform: translateY(0); } }
            `}</style>

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} />

                <div className="flex flex-1 h-full overflow-hidden relative">
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="settings" />

                    <main className="flex-1 w-full h-full overflow-auto transition-all duration-500 ease-in-out bg-[#f8fafc]" style={{ paddingLeft: sidebarOpen ? "200px" : "0px" }}>
                        <div className="p-4 md:p-6 max-w-[1000px] mx-auto w-full">
                            
                            {/* Header Area */}
                            <div className="mb-6 form-enter">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                    <span className="text-slate-800">Configuration</span>
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                    <span className="text-slate-500">System Parameters</span>
                                </div>
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Settings</h2>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                
                                {/* Shapefile Upload Module */}
                                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_2px_10px_rgb(0,0,0,0.02)] form-enter h-fit">
                                    <div className="mb-4">
                                        <h3 className="text-[14px] font-black text-slate-800">Spatial Data Management</h3>
                                        <p className="text-[11px] font-medium text-slate-500 mt-1">Upload updated shapefile boundaries (.zip containing .shp, .shx, .dbf, .prj).</p>
                                    </div>
                                    
                                    <form onSubmit={handleUploadSubmit} className="space-y-4">
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Target Map Layer</label>
                                            <select
                                                value={uploadLayer}
                                                onChange={(e) => setUploadLayer(e.target.value)}
                                                className="w-full text-[12px] font-medium px-3 py-2.5 rounded-[10px] border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 outline-none focus:border-blue-500 focus:bg-white transition-all appearance-none cursor-pointer"
                                                required
                                            >
                                                <option value="" disabled>Select layer to update...</option>
                                                <option value="municipal_boundary">Municipal Boundary</option>
                                                <option value="barangay_boundary">Barangay Boundary</option>
                                                <option value="land_use_plan">Comprehensive Land Use Plan (CLUP)</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Shapefile Bundle (.zip)</label>
                                            <div 
                                                onClick={() => fileInputRef.current.click()}
                                                className={`w-full border-2 border-dashed rounded-[12px] p-6 text-center cursor-pointer transition-all ${selectedFile ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
                                            >
                                                <input 
                                                    type="file" 
                                                    accept=".zip" 
                                                    ref={fileInputRef} 
                                                    onChange={handleFileChange} 
                                                    className="hidden" 
                                                />
                                                {selectedFile ? (
                                                    <div className="flex flex-col items-center gap-2">
                                                        <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        <span className="text-[12px] font-bold text-slate-700">{selectedFile.name}</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                                        </svg>
                                                        <span className="text-[11px] font-medium">Click to browse or drag .zip file here</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <button 
                                            type="submit" 
                                            className="w-full mt-2 inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-[10px] bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-bold shadow-sm transition-all active:scale-95"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                            Upload & Overwrite Layer
                                        </button>
                                    </form>
                                </div>

                                {/* iMAPS General Settings Module */}
                                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_2px_10px_rgb(0,0,0,0.02)] form-enter h-fit" style={{ animationDelay: '0.1s' }}>
                                    <div className="mb-4">
                                        <h3 className="text-[14px] font-black text-slate-800">Map Preferences</h3>
                                        <p className="text-[11px] font-medium text-slate-500 mt-1">Configure default behaviors for the interactive web map.</p>
                                    </div>
                                    
                                    <form onSubmit={handleSaveMapSettings} className="space-y-4">
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Default Map Focus (Lat, Lng)</label>
                                            <input
                                                type="text"
                                                value={mapSettings.defaultCenter}
                                                onChange={(e) => setMapSettings({...mapSettings, defaultCenter: e.target.value})}
                                                className="w-full rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 transition-all hover:border-slate-300"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Zoom Level</label>
                                                <input
                                                    type="number"
                                                    value={mapSettings.defaultZoom}
                                                    onChange={(e) => setMapSettings({...mapSettings, defaultZoom: e.target.value})}
                                                    className="w-full rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 transition-all hover:border-slate-300"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Coordinate System</label>
                                                <input
                                                    type="text"
                                                    disabled
                                                    value={mapSettings.crs}
                                                    className="w-full rounded-[10px] border border-slate-200 bg-slate-100 px-3 py-2.5 text-[12px] font-bold text-slate-500 cursor-not-allowed"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Default Basemap</label>
                                            <div className="flex gap-3">
                                                {['satellite', 'street', 'topographic'].map((type) => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => setMapSettings({...mapSettings, baseMap: type})}
                                                        className={`flex-1 py-2 text-[11px] font-bold capitalize rounded-[8px] border transition-all ${
                                                            mapSettings.baseMap === type 
                                                            ? 'border-blue-600 bg-blue-50 text-blue-700' 
                                                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <button 
                                            type="submit" 
                                            className="w-full mt-4 inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold shadow-sm transition-all active:scale-95"
                                        >
                                            Save System Preferences
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}