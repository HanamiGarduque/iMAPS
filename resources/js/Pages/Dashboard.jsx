import { useState, useEffect, useRef } from 'react'
import { Head, router } from '@inertiajs/react'
import Swal from 'sweetalert2'

// ── Stat Bar Component ──
function StatBar({ label, pct, color, bg, count, iconColor }) {
    const [width, setWidth] = useState(0)
    useEffect(() => {
        const t = setTimeout(() => setWidth(pct), 150)
        return () => clearTimeout(t)
    }, [pct])
    
    return (
        <div className={count !== undefined ? "mb-3.5" : "mb-0"}>
            <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block shadow-sm" style={{ background: iconColor || color }} />
                    {label}
                </span>
                {count !== undefined ? (
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-slate-400">{count} records</span>
                        <span className="text-[11px] font-bold font-mono w-6 text-right" style={{ color }}>{pct}%</span>
                    </div>
                ) : (
                    <span className="text-[11px] font-bold font-mono text-slate-700">{pct}%</span>
                )}
            </div>
            <div className="stat-bar-track" style={{ background: bg || '#e8f0fe' }}>
                <div 
                    className="stat-bar-fill" 
                    style={{ width: width + '%', background: color }}
                />
            </div>
        </div>
    )
}

// ── Realistic Temporal Data Engine (Rosario, Batangas) ──
const getTemporalData = (baseData, name, year) => {
    // 1. Categorize Rosario's 48 Barangays based on real-world geography
    const urbanCore = ['Poblacion A', 'Poblacion B', 'Poblacion C', 'Poblacion D', 'Poblacion E', 'Poblacion', 'San Roque', 'Namunga', 'Quilib'];
    const industrialCorridor = ['San Carlos', 'Bagong Pook', 'San Jose', 'Inica', 'Cahigam', 'Calantas'];
    const residentialSprawl = ['Itlugan', 'Masaya', 'Bayawang', 'Pinagsibaan', 'Antipolo', 'Bulihan', 'Maligaya'];
    // All other barangays default to Agricultural / Rural
    
    // 2. Set baselines if the barangay isn't explicitly in the staticBgyData list
    let currentLandUse = baseData?.landUse;
    if (!currentLandUse) {
        if (urbanCore.includes(name)) currentLandUse = 'Commercial';
        else if (industrialCorridor.includes(name)) currentLandUse = 'Agro-industrial';
        else if (residentialSprawl.includes(name)) currentLandUse = 'Residential';
        else currentLandUse = 'Agricultural';
    }

    const data = baseData || { total: Math.floor(Math.random() * 5) + 2, review: 1, released: 2, landUse: currentLandUse, diversity: 0.3 };
    const yearDiff = year - 2020;
    
    // 3. Apply Time Trends (2020 to 2026 Real-World Shifts)
    let growthRate = 1.2; // Default slow rural growth

    if (urbanCore.includes(name)) {
        growthRate = 4.5; // Rapid application generation in the center
        if (year >= 2022 && currentLandUse === 'Residential') currentLandUse = 'Commercial';
    } 
    else if (industrialCorridor.includes(name)) {
        growthRate = 3.8; // High growth along highways
        if (year >= 2021 && currentLandUse === 'Agricultural') currentLandUse = 'Agro-industrial';
        if (year >= 2024 && currentLandUse === 'Agro-industrial') currentLandUse = 'Industrial'; // Factories moving in by 2024
    }
    else if (residentialSprawl.includes(name)) {
        growthRate = 2.8; // Subdivisions being built
        if (year >= 2023 && currentLandUse === 'Agricultural') currentLandUse = 'Residential';
    }
    // Rural areas (e.g., Tulos, Macalamcam) remain Agricultural with 1.2 growth.

    // 4. Calculate simulated totals based on the specific growth rate
    const newTotal = Math.max(1, Math.floor((data.total) + (yearDiff * growthRate)));
    
    return { 
        ...data, 
        total: newTotal, 
        review: Math.floor(newTotal * 0.2), 
        released: Math.floor(newTotal * 0.7), 
        landUse: currentLandUse,
        diversity: Math.min(0.95, (data.diversity || 0.4) + (yearDiff * 0.05)) // Land mix diversifies over time
    };
};

// ── Leaflet Map ──
function LeafletMap({ bgyStats, currentLayer, onFeatureClick, onMapClick, appTypeFilter, year }) {
    const mapRef = useRef(null)
    const mapInstanceRef = useRef(null)
    const geoLayerRef = useRef(null)
    const activeFeatureRef = useRef(null)
    
    // Use refs to avoid stale closures inside Leaflet event listeners
    const layerRef = useRef(currentLayer)
    useEffect(() => { layerRef.current = currentLayer }, [currentLayer])

    // Static data from original code
    const staticBgyData = {
        'Antipolo':    {total:4,  review:2, released:2, landUse:'Residential',  diversity:0.65},
        'Namunga':     {total:8,  review:4, released:2, landUse:'Agricultural', diversity:0.72},
        'Calantas':    {total:27, review:9, released:10,landUse:'Agro-industrial',diversity:0.88},
        'Poblacion':   {total:19, review:7, released:8, landUse:'Commercial',   diversity:0.61},
        'San Rafael':  {total:12, review:5, released:5, landUse:'Residential',  diversity:0.55},
        'Sta. Cruz':   {total:6,  review:2, released:3, landUse:'Agricultural', diversity:0.48},
        'Alupay':      {total:15, review:3, released:12,landUse:'Agricultural', diversity:0.50}, // Added sample for testing
    }

    const statusColor = (total) => {
        if (total >= 25) return '#1e3a8a' // Dark blue
        if (total >= 18) return '#1d4ed8'
        if (total >= 12) return '#2563eb' // Standard blue
        if (total >= 8)  return '#60a5fa'
        if (total >= 4)  return '#93c5fd'
        return '#dbeafe' // Light blue
    }

    const landUseColors = {
        'Residential':     {fill:'#22c55e', stroke:'#16a34a'},
        'Agricultural':    {fill:'#84cc16', stroke:'#65a30d'},
        'Commercial':      {fill:'#f59e0b', stroke:'#d97706'},
        'Industrial':      {fill:'#ef4444', stroke:'#dc2626'},
        'Agro-industrial': {fill:'#8b5cf6', stroke:'#7c3aed'},
        'Special':         {fill:'#64748b', stroke:'#475569'},
    }

    const diversityColor = (score) => {
        const v = Math.round(255 - score * 180)
        return `rgba(${v},${v},${v})`
    }

    // THIS IS THE KEY STYLING FUNCTION
    const getFeatureStyle = (feature, layer, filter, currentYear) => {
        const props = feature.properties || {}
        const name = (props.ADM4_EN || props.name || props.NAME || props.BRGY || props.brgy || '').trim()
        
        const temporalData = getTemporalData(staticBgyData[name], name, currentYear);
        const multipliers = { 'Zoning Certificate': 1, 'Locational Clearance': 0.4, 'Development Permit': 0.8 };
        const simulatedTotal = Math.max(1, Math.floor(temporalData.total * (multipliers[filter] || 1)));

        const baseStyle = { color: '#2563eb', weight: 2, opacity: 1 }

        if (layer === 'status') {
            return { ...baseStyle, fillColor: statusColor(simulatedTotal), fillOpacity: 0.15 }
        } else if (layer === 'trends') {
            const lu = landUseColors[temporalData.landUse] || landUseColors['Residential']
            return { ...baseStyle, fillColor: lu.fill, fillOpacity: 0.5 }
        } else {
            return { ...baseStyle, fillColor: diversityColor(temporalData.diversity), fillOpacity: 0.25, dashArray: null }
        }
    }

    useEffect(() => {
        if (mapInstanceRef.current) return

        import('leaflet').then(L => {
            import('leaflet/dist/leaflet.css')

            const map = L.default.map(mapRef.current, {
                center: [13.8352, 121.2167],
                zoom: 13,
                zoomControl: false,
                scrollWheelZoom: true,
            })

            L.default.control.zoom({ position: 'bottomleft' }).addTo(map)
            
            L.default.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19,
                className: 'map-tiles'
            }).addTo(map)

            mapInstanceRef.current = map

            // Deselect on map click
            map.on('click', () => {
                if (onMapClick) onMapClick()
                if (activeFeatureRef.current && geoLayerRef.current) {
                    geoLayerRef.current.resetStyle(activeFeatureRef.current)
                    activeFeatureRef.current = null
                }
            })

            fetch('/geojson/rosario_brgy_map.geojson')
                .then(r => { if (!r.ok) throw new Error('GeoJSON not found'); return r.json(); })
                .then(data => {
                    geoLayerRef.current = L.default.geoJSON(data, {
                        style: feature => getFeatureStyle(feature, layerRef.current, appTypeFilter, year),
                        onEachFeature: (feature, layer_feature) => {

                            const props = feature.properties || {}
                const name = (props.ADM4_EN || props.name || props.NAME || props.BRGY || props.brgy || 'Unknown').trim()
                const bgyData = staticBgyData[name] || { total: Math.floor(Math.random()*20)+1, review: Math.floor(Math.random()*5), released: Math.floor(Math.random()*5), landUse: 'Residential', diversity: 0.65 }

                const popupContent = `
                    <div class="min-w-[260px] font-sans">
                        <div class="mb-3 pb-3 border-b border-slate-100">
                            <h2 class="text-xl font-black text-blue-900 tracking-tight flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-600 drop-shadow-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                ${name}
                            </h2>
                            <p class="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest pl-7">Zone Overview</p>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="flex flex-col items-center justify-center bg-white rounded-xl py-2 px-1 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                <div class="flex items-center gap-1 mb-1">
                                    <svg class="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Total</span>
                                </div>
                                <span class="text-xl font-black text-slate-800 font-mono">${bgyData.total || 0}</span>
                            </div>
                            <div class="flex flex-col items-center justify-center bg-amber-50 rounded-xl py-2 px-1 border border-amber-200 shadow-sm hover:shadow-md transition-shadow">
                                <div class="flex items-center gap-1 mb-1">
                                    <svg class="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span class="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Review</span>
                                </div>
                                <span class="text-xl font-black text-amber-600 font-mono">${bgyData.review || 0}</span>
                            </div>
                            <div class="flex flex-col items-center justify-center bg-emerald-50 rounded-xl py-2 px-1 border border-emerald-200 shadow-sm hover:shadow-md transition-shadow">
                                <div class="flex items-center gap-1 mb-1">
                                    <svg class="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span class="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Released</span>
                                </div>
                                <span class="text-xl font-black text-emerald-600 font-mono">${bgyData.released || 0}</span>
                            </div>
                        </div>
                    </div>
                `;

                layer_feature.bindPopup(popupContent, {
                    className: 'custom-bgy-popup',
                    closeButton: true,
                    autoPanPadding: [50, 50] 
                });
                            
                            layer_feature.on('click', e => {
                                L.default.DomEvent.stopPropagation(e)
                                
                                if (activeFeatureRef.current && geoLayerRef.current) {
                                    geoLayerRef.current.resetStyle(activeFeatureRef.current)
                                }
                                activeFeatureRef.current = layer_feature

                                const props = feature.properties || {}
                                const name = (props.ADM4_EN || props.name || props.NAME || props.BRGY || props.brgy || 'Unknown').trim()
                                const bgyData = staticBgyData[name] || { total: Math.floor(Math.random()*20)+1, review: Math.floor(Math.random()*5), released: Math.floor(Math.random()*5), landUse: 'Residential', diversity: 0.65 }

                                const currentLayerMode = layerRef.current
                                if (currentLayerMode === 'status') {
                                    layer_feature.setStyle({ weight: 4, color: '#1e3a8a', fillColor: '#2563eb', fillOpacity: 0.4 })
                                    if (onFeatureClick) onFeatureClick(name, bgyData)
                                } else if (currentLayerMode === 'diversity') {
                                    layer_feature.setStyle({ weight: 4, color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 0.4 })
                                } else {
                                    const lu = landUseColors[bgyData.landUse] || landUseColors['Residential']
                                    layer_feature.setStyle({ weight: 4, color: lu.stroke, fillColor: lu.fill, fillOpacity: 0.5 })
                                }
                            })
                            
                            layer_feature.on('mouseover', () => {
                                const props = feature.properties || {}
                                const name = (props.ADM4_EN || props.name || props.NAME || props.BRGY || props.brgy || 'Unknown').trim()
                                
                                layer_feature.bindTooltip(name, {
                                    permanent: false, direction: 'center',
                                    className: 'font-sans text-xs font-semibold bg-white text-slate-800 border-0 shadow-lg px-3 py-1.5 rounded-lg'
                                }).openTooltip()

                                if (activeFeatureRef.current !== layer_feature) {
                                    layer_feature.setStyle({ fillOpacity: 0.35, weight: 3 });
                                }
                            })

                            layer_feature.on('mouseout', () => {
                                layer_feature.closeTooltip()
                                if (activeFeatureRef.current !== layer_feature) {
                                    geoLayerRef.current.resetStyle(layer_feature)
                                }
                            })
                        }
                    }).addTo(map)

                    map.fitBounds(geoLayerRef.current.getBounds(), { padding: [30, 30] })
                })
                .catch(err => console.warn('GeoJSON load error:', err))
        })

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
            }
        }
    }, [])

    useEffect(() => {
        if (geoLayerRef.current) {
            geoLayerRef.current.setStyle(feature => getFeatureStyle(feature, currentLayer, appTypeFilter, year))
            if (activeFeatureRef.current) {
                activeFeatureRef.current = null
            }
        }
    }, [currentLayer, appTypeFilter, year])

    return <div ref={mapRef} id="map" className="absolute inset-0 z-0" />
}

// ── Main Dashboard ──
export default function Dashboard({ userName, userRole, total, thisMonth, statusMap, bgyStats }) {
    const [activeLayer, setActiveLayer] = useState('status')
    const [appTypeFilter, setAppTypeFilter] = useState('Zoning Certificate')
    const [layerPopupOpen, setLayerPopupOpen] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [clock, setClock] = useState('')
    const [year, setYear] = useState(2026)
    const [donutLoaded, setDonutLoaded] = useState(false)
    const [selectedBgy, setSelectedBgy] = useState(null)

    const review = statusMap?.['Technical Review'] ?? 0
    const released = statusMap?.['Released'] ?? 0
    const safeTotal = total || 1
    const processingPct = Math.round(((safeTotal - review - released) / safeTotal) * 100)
    const reviewPct = Math.round((review / safeTotal) * 100)
    const releasedPct = Math.round((released / safeTotal) * 100)

   // ── Alert Initialization (Minimized & Font Adjusted) ──
    useEffect(() => {
        // Check if the welcome message has already been shown this session
        const hasShownWelcome = sessionStorage.getItem('hasShownWelcome');

        if (!hasShownWelcome && userName) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: `Welcome back, ${userName || 'Staff'}!`,
                text: 'Successfully logged in.',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true,
                customClass: {
                    popup: 'swal-small-toast',
                },
                didOpen: (toast) => {
                    toast.onmouseenter = Swal.stopTimer;
                    toast.onmouseleave = Swal.resumeTimer;
                }
            });
            
            // Set the flag so it doesn't trigger on reloads or page switches
            sessionStorage.setItem('hasShownWelcome', 'true');
        }
    }, [userName]);

    // ── Handle Custom Logout Process ──
    const handleLogout = () => {
        Swal.fire({
            title: 'Sign Out?',
            text: "Are you sure you want to log out of iMAPS?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#1e40af',
            cancelButtonColor: '#ef4444',
            confirmButtonText: 'Yes',
            cancelButtonText: 'Cancel',
            customClass: {
                popup: 'swal-small-modal',
                title: 'text-blue-900 font-black',
            }
        }).then((result) => {
            if (result.isConfirmed) {
                // Clear the flag so the welcome alert shows on the next login
                sessionStorage.removeItem('hasShownWelcome');

                Swal.fire({
                    title: 'Logged Out!',
                    text: 'You have been successfully logged out.',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false,
                    customClass: {
                        popup: 'swal-small-modal'
                    }
                }).then(() => {
                    router.post('/logout');
                });
            }
        });
    };

    useEffect(() => {
        const tick = () => {
            const now = new Date()
            setClock(
                now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
                ' · ' +
                now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
            )
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])

    useEffect(() => {
        if (activeLayer === 'diversity') {
            setTimeout(() => setDonutLoaded(true), 150)
        } else {
            setDonutLoaded(false)
        }
        if (activeLayer !== 'status') {
            setSelectedBgy(null)
        }
    }, [activeLayer])

    const rsConfig = {
        status: {
            label: 'Application Status', title: 'Map Overview',
            icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        },
        trends: {
            label: 'Time Trends', title: 'Land Use Analysis',
            icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        },
        diversity: {
            label: 'Diversity Index', title: 'Land Use Mix Analysis',
            icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></>
        }
    }

    const trendFactor = 1 + ((year - 2020) * 0.15);
    
    const landUseData = [
        ['Residential', Math.floor(82 * trendFactor), Math.min(100, Math.floor(40 * trendFactor * 0.8)), '#22c55e', '#dcfce7'],
        ['Commercial', Math.floor(34 * trendFactor * 1.5), Math.min(100, Math.floor(17 * trendFactor * 1.2)), '#f59e0b', '#fef3c7'],
        ['Agricultural', Math.floor(44 / trendFactor), Math.floor(22 / trendFactor), '#84cc16', '#ecfccb'],
        ['Agro-industrial', Math.floor(14 * trendFactor * 1.8), Math.min(100, Math.floor(7 * trendFactor * 1.5)), '#8b5cf6', '#f3e8ff'],
        ['Industrial', Math.floor(22 * trendFactor), Math.min(100, Math.floor(11 * trendFactor)), '#ef4444', '#fee2e2'],
        ['Special projects', Math.floor(7 * trendFactor), Math.min(100, Math.floor(3 * trendFactor)), '#64748b', '#f1f5f9'],
    ].sort((a, b) => b[1] - a[1]);

    const hotspots = [
        { rank: 1, name: 'San Roque', type: year >= 2023 ? 'Commercial' : 'Residential', color: year >= 2023 ? '#f59e0b' : '#22c55e', bg: year >= 2023 ? '#fef3c7' : '#dcfce7', count: Math.floor(42 * trendFactor) },
        { rank: 2, name: 'Quilib', type: year >= 2024 ? 'Industrial' : 'Agro-industrial', color: year >= 2024 ? '#ef4444' : '#8b5cf6', bg: year >= 2024 ? '#fee2e2' : '#f3e8ff', count: Math.floor(38 * trendFactor) },
        { rank: 3, name: 'San Carlos', type: year >= 2024 ? 'Industrial' : 'Agro-industrial', color: year >= 2024 ? '#ef4444' : '#8b5cf6', bg: year >= 2024 ? '#fee2e2' : '#f3e8ff', count: Math.floor(35 * trendFactor) },
        { rank: 4, name: 'Poblacion B', type: 'Commercial', color: '#f59e0b', bg: '#fef3c7', count: Math.floor(31 * trendFactor) },
        { rank: 5, name: 'Pinagsibaan', type: year >= 2023 ? 'Residential' : 'Agricultural', color: year >= 2023 ? '#22c55e' : '#84cc16', bg: year >= 2023 ? '#dcfce7' : '#ecfccb', count: Math.floor(28 * trendFactor) },
    ]

    return (
        <>
            <Head title="Dashboard | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
                
                #dashboard-root, #dashboard-root :not(.font-mono) { font-family: 'Poppins', sans-serif !important; }
                #dashboard-root .font-mono, #dashboard-root .font-mono * { font-family: 'DM Mono', monospace !important; }
                
                /* --- Custom SweetAlert2 Sizing & Fonts --- */
                .swal2-container { font-family: 'Poppins', sans-serif !important; }
                
                /* Toast styling */
                .swal-small-toast { width: auto !important; padding: 0.5rem 0.75rem !important; min-height: unset !important; }
                .swal-small-toast .swal2-title { font-size: 0.85rem !important; margin-bottom: 0px !important; }
                .swal-small-toast .swal2-html-container { font-size: 0.75rem !important; margin-top: 0px !important; }
                .swal-small-toast .swal2-icon { transform: scale(0.65); margin: 0 0.5rem 0 0 !important; }
                
                /* Modal styling */
                .swal-small-modal { width: 320px !important; padding: 1.25rem !important; border-radius: 16px !important; }
                .swal-small-modal .swal2-icon { transform: scale(0.8); margin: 0 auto 0.5rem !important; }
                .swal-small-modal .swal2-title { font-size: 1.1rem !important; }
                .swal-small-modal .swal2-html-container { font-size: 0.85rem !important; margin-top: 0.25rem !important; color: #64748b; }
                .swal-small-modal .swal2-actions { margin-top: 1rem !important; gap: 8px !important; }
                .swal-small-modal .swal2-styled { padding: 0.4rem 1.25rem !important; font-size: 0.8rem !important; border-radius: 8px !important; font-weight: 600 !important; }

                /* Other existing map styles... */
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

                .leaflet-control-zoom { border: none !important; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important; margin-left: 24px !important; margin-bottom: 24px !important; }
                .leaflet-control-zoom a { color: #475569 !important; background: rgba(255,255,255,0.9) !important; backdrop-filter: blur(4px); transition: all 0.2s; }
                .leaflet-control-zoom a:hover { color: #1a45ee !important; background: #fff !important; }

                #right-sidebar {
                    position: absolute; top: 24px; right: 24px; bottom: 24px; width: 360px;
                    z-index: 500; background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
                    border: 1px solid rgba(255,255,255,0.4); border-radius: 16px;
                    display: flex; flex-direction: column; overflow: hidden;
                    transition: transform 0.4s cubic-bezier(0.4,0,0.2,1);
                }
                #right-sidebar-inner { flex: 1; overflow-y: auto; overflow-x: hidden; background: rgba(250, 250, 250, 0.8); }

                .view-layer-btn { display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; background: transparent; width: 100%; text-align: left; border-radius: 8px; border: none; transition: background 0.2s; }
                .view-layer-btn:hover { background: #f8fafc; }
                .view-layer-radio { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #cbd5e1; background: white; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: border-color 0.2s; }
                .view-layer-btn.active .view-layer-radio { border-color: #3b82f6; }
                .view-layer-radio-dot { width: 6px; height: 6px; background: #3b82f6; border-radius: 50%; opacity: 0; transform: scale(0.4); transition: all 0.2s; }
                .view-layer-btn.active .view-layer-radio-dot { opacity: 1; transform: scale(1); }

                .stat-bar-track { height: 6px; background: #e8f0fe; border-radius: 3px; overflow: hidden; margin-top: 6px; }
                .stat-bar-fill { height: 100%; border-radius: 3px; transition: width 1s cubic-bezier(0.34,1.56,0.64,1); }

                .timeline-thumb {
                    -webkit-appearance: none; appearance: none; height: 4px;
                    background: linear-gradient(to right, #3b82f6 var(--val, 100%), #e2e8f0 var(--val, 100%));
                    border-radius: 2px; outline: none; cursor: pointer;
                }
                .timeline-thumb::-webkit-slider-thumb {
                    -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
                    background: #3b82f6; border: 2px solid white;
                    box-shadow: 0 0 0 2px rgba(59,130,246,0.25), 0 2px 6px rgba(59,130,246,0.2);
                    cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
                }
                .timeline-thumb::-webkit-slider-thumb:hover { transform: scale(1.2); box-shadow: 0 0 0 4px rgba(59,130,246,0.2), 0 2px 8px rgba(59,130,246,0.25); }

                .app-table { width: 100%; border-collapse: collapse; font-size: 12px; }
                .app-table th { background: #f8fafc; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: left; position: sticky; top: 0; z-index: 10; }
                .app-table td { padding: 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
                .app-table tr:hover td { background: #f8faff; }
                .app-table .view-link { color: #3b82f6; font-weight: 600; cursor: pointer; }
                .app-table .view-link:hover { text-decoration: underline; }
                .metric-card { background: white; border-radius: 12px; padding: 14px; border: 1px solid rgba(226, 232, 240, 0.8); transition: box-shadow 0.2s, transform 0.2s; }
                .metric-card:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.05); transform: translateY(-1px); }
                .panel-section { background: rgba(255, 255, 255, 0.6); border-top: 1px solid rgba(226, 232, 240, 0.6); border-bottom: 1px solid rgba(226, 232, 240, 0.6); margin-bottom: 16px; }
                .rs-section-head { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #64748b; padding: 16px 16px 8px; }
                
                .map-overlay-card {
                    background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.4); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                    border-radius: 12px; padding: 14px;
                }

                .custom-bgy-popup .leaflet-popup-content-wrapper {
                    border-radius: 16px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                    border: 1px solid rgba(226, 232, 240, 0.8);
                    padding: 2px;
                }
                .custom-bgy-popup .leaflet-popup-content {
                    margin: 14px;
                }
                .custom-bgy-popup .leaflet-popup-tip {
                    background: white;
                    border: 1px solid rgba(226, 232, 240, 0.8);
                }
                .custom-bgy-popup .leaflet-popup-close-button {
                    color: #94a3b8 !important;
                    margin-top: 12px !important;
                    margin-right: 12px !important;
                    font-size: 18px !important;
                    transition: color 0.2s;
                }
                .custom-bgy-popup .leaflet-popup-close-button:hover {
                    color: #1e3a8a !important;
                    background: transparent !important;
                }
            `}</style>

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                {/* ── Header ── */}
                <header className="h-16 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-4 sm:px-6 shrink-0 z-[700] sticky top-0">
                    <div className="flex items-center gap-4 lg:gap-6">
                        <a href="#" className="flex items-center gap-2.5 group">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all duration-300">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                            </div>
                            <span className="font-black text-xl tracking-tight text-slate-800 group-hover:text-blue-700 transition-colors">iMAPS</span>
                        </a>
                        <div className="h-5 w-px bg-slate-200 hidden md:block" />
                        <div className="hidden md:flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-full px-3 py-1 shadow-sm">
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                            </span>
                            <span className="text-xs font-semibold text-slate-600 tracking-wide uppercase">Rosario, Batangas</span>
                        </div>
                    </div>

                    <div className="hidden lg:flex flex-1 max-w-md mx-6">
                        <div className="relative w-full group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <input type="text" placeholder="Search applications, zones, or parcels..." className="block w-full pl-9 pr-12 py-2 border border-slate-200 rounded-xl leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-all shadow-sm" />
                            <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                                <kbd className="inline-flex items-center border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-sans font-semibold text-slate-400 bg-white">⌘K</kbd>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4">
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-600">
                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-[13px] font-mono font-medium">{clock}</span>
                        </div>
                        <button className="relative p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                            <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500 border border-white" />
                            </span>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </button>
                        <div className="h-6 w-px bg-slate-200 hidden sm:block" />
                        <div className="flex items-center gap-3 pl-1 pr-2 py-1 cursor-pointer group rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all">
                            <div className="relative">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white group-hover:ring-blue-100 transition-all">
                                    {userName?.charAt(0).toUpperCase() || 'S'}
                                </div>
                                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
                            </div>
                            <div className="hidden sm:flex flex-col text-left justify-center">
                                <p className="text-[13px] font-bold text-slate-700 leading-tight group-hover:text-blue-700 transition-colors">{userName || 'Staff'}</p>
                                <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">{userRole || 'Planning Officer'}</p>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex flex-1 overflow-hidden relative bg-slate-100">
                    
                    {/* ── Left Sidebar ── */}
                    <aside className={`absolute top-40 left-0 w-[220px] h-max max-h-[calc(100vh-10rem)] bg-white z-[600] rounded-r-3xl shadow-[4px_4px_24px_rgba(0,0,0,0.1)] flex flex-col py-5 transition-transform duration-500 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="absolute top-1/2 -translate-y-1/2 -right-8 w-8 h-12 bg-blue-800 hover:bg-blue-900 text-white rounded-r-xl flex items-center justify-center shadow-md transition-colors focus:outline-none">
                            <svg className={`w-4 h-4 transition-transform duration-500 ${!sidebarOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>

                        <div className="px-5 pb-5 pt-1 border-b border-slate-100 flex flex-col items-center justify-center">
                            <h1 className="text-3xl font-black text-blue-900 tracking-tighter leading-none">iMAPS</h1>
                            <span className="text-[10px] font-bold text-blue-700 tracking-[0.2em] uppercase mt-1">Rosario</span>
                        </div>

                        <nav className="flex-1 flex flex-col gap-1 py-4 overflow-y-auto">
                            <a href="/dashboard" className="flex items-center gap-3 px-5 py-2.5 bg-blue-800 text-white font-semibold text-sm rounded-r-xl mr-4 shadow-sm transition-all">
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                </svg>
                                <span>Dashboard</span>
                            </a>
                            <a href="/applications" className="flex items-center gap-3 px-5 py-2.5 text-slate-700 hover:bg-blue-50 hover:text-blue-800 font-medium text-sm rounded-r-xl mr-4 transition-all">
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span>Applications</span>
                            </a>
                            <a href="/analytics" className="flex items-center gap-3 px-5 py-2.5 text-slate-700 hover:bg-blue-50 hover:text-blue-800 font-medium text-sm rounded-r-xl mr-4 transition-all">
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                <span>Analytics</span>
                            </a>
                           <a href="/audit" className="flex items-center gap-3 px-5 py-2.5 text-slate-700 hover:bg-blue-50 hover:text-blue-800 font-medium text-sm rounded-r-xl mr-4 transition-all">
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Audit Trail</span>
                            </a>
                        </nav>

                        <div className="border-t border-slate-100 py-3 mt-2">
                            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-5 py-2.5 text-slate-600 hover:bg-slate-50 hover:text-blue-700 font-medium text-sm transition-all rounded-r-xl mr-4">
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                <span>Sign Out</span>
                            </button>
                        </div>
                    </aside>

                    {/* ── Main Map Content ── */}
                    <main className="flex-1 relative flex flex-col min-w-0">
                       <LeafletMap 
                            bgyStats={bgyStats} 
                            currentLayer={activeLayer}
                            appTypeFilter={appTypeFilter} 
                            year={year}
                            onFeatureClick={(name, data) => setSelectedBgy({ name, data })}
                            onMapClick={() => setSelectedBgy(null)}
                        />
                            {/* ── Application Type Filter (Tactile Segmented Control) ── */}
<div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-[650] flex items-center bg-slate-100/90 backdrop-blur-xl p-1.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/60 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeLayer === 'status' ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'}`}>
    {[
        {
            id: 'Zoning Certificate',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        },
        {
            id: 'Locational Clearance',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        },
        {
            id: 'Development Permit',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
        }
    ].map(type => {
        const isActive = appTypeFilter === type.id;
        return (
            <button
                key={type.id}
                onClick={() => setAppTypeFilter(type.id)}
                className={`relative flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] transition-all duration-300 ease-out ${
                    isActive 
                        ? 'text-blue-800 font-black bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] ring-1 ring-black/5' 
                        : 'text-slate-500 font-semibold hover:text-slate-800 hover:bg-slate-200/50'
                }`}
            >
                <span className={`transition-transform duration-300 ${isActive ? 'scale-110 text-blue-600' : 'text-slate-400'}`}>
                    {type.icon}
                </span>
                {type.id}
            </button>
        );
    })}
</div>


                       {/* ── Geospatial Time Controller (Discrete Segmented Timeline) ── */}
<div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-[450] flex flex-col items-center gap-2.5 transition-all duration-700 ease-out ${activeLayer === 'trends' ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-8 pointer-events-none'}`}>
    
    {/* Floating Header */}
    <div className="flex items-center gap-3 bg-white/70 backdrop-blur-md px-4 py-1.5 rounded-full shadow-sm border border-white/50">
        <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600">Land Use Projection</span>
    </div>

    {/* Main Control Panel */}
    <div className="flex items-center p-1.5 bg-white/90 backdrop-blur-xl border border-white rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.1)]">
        
        {/* Playback Button */}
        <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm ring-1 ring-slate-200 group">
            <svg className="w-4 h-4 ml-0.5 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
        
        <div className="w-px h-6 bg-slate-200 mx-2" />
        
        {/* Discrete Year Buttons */}
        <div className="flex items-center gap-1">
            {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map(y => {
                const isActive = year === y;
                const isPast = y < year;
                return (
                    <button
                        key={y}
                        onClick={() => setYear(y)}
                        className={`relative group px-4 py-2.5 rounded-xl font-mono text-[13px] font-bold transition-all duration-300 ${
                            isActive 
                                ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-md ring-2 ring-blue-500/20 transform scale-105' 
                                : isPast 
                                    ? 'text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-blue-700'
                                    : 'text-slate-400 hover:bg-slate-50 hover:text-blue-600'
                        }`}
                    >
                        {y}
                        
                        {/* Status Dot */}
                        <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transition-all duration-300 ${
                            isActive ? 'bg-white' : isPast ? 'bg-blue-300' : 'bg-transparent'
                        }`} />
                    </button>
                );
            })}
        </div>
    </div>
</div>

                        {/* ── Layer Control Bottom Left ── */}
                        <div className="absolute bottom-8 left-8 z-[650]">
                            <div className={`bg-white rounded-xl shadow-xl border border-slate-200 w-[200px] mb-2 overflow-hidden transition-all duration-300 ${layerPopupOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                                <div className="bg-blue-800 py-2.5 px-4">
                                    <span className="text-[12px] font-semibold text-white tracking-wide">View Layer</span>
                                </div>
                                <div className="p-2 space-y-0.5">
                                    {[
                                        { key: 'status', label: 'Application Status' },
                                        { key: 'trends', label: 'Time Trends' },
                                        { key: 'diversity', label: 'Diversity Index' }
                                    ].map(l => (
                                        <button key={l.key} className={`view-layer-btn ${activeLayer === l.key ? 'active' : ''}`} onClick={() => { setActiveLayer(l.key); setLayerPopupOpen(false); if(sidebarOpen) setSidebarOpen(false); }}>
                                            <div className="view-layer-radio"><div className="view-layer-radio-dot" /></div>
                                            <span className="text-[12px] font-medium text-slate-700">{l.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => setLayerPopupOpen(!layerPopupOpen)} className={`w-11 h-11 bg-blue-800 hover:bg-blue-900 text-white rounded-xl shadow-lg flex items-center justify-center transition-all focus:outline-none ${layerPopupOpen ? 'ring-4 ring-blue-500/30' : ''}`}>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
                                </svg>
                            </button>
                        </div>

                        {/* ── Right Sidebar Panel ── */}
                        <aside id="right-sidebar">
                            <div className="shrink-0 bg-blue-950 text-white px-5 py-4 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300">{rsConfig[activeLayer].label}</p>
                                    <h2 className="text-base font-bold mt-0.5 leading-tight">{rsConfig[activeLayer].title}</h2>
                                </div>
                                <div className="w-9 h-9 rounded-full bg-blue-800 flex items-center justify-center shadow-inner border border-blue-700">
                                    <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        {rsConfig[activeLayer].icon}
                                    </svg>
                                </div>
                            </div>

                            <div id="right-sidebar-inner">
                                {/* ── Status Panel ── */}
                                {activeLayer === 'status' && (
                                    <div>
                                        <div className="p-4 panel-section border-t-0 mt-0">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="metric-card bg-slate-50">
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Apps</p>
                                                    <p className="text-2xl font-bold text-slate-800 font-mono mt-1">{total}</p>
                                                </div>
                                                <div className="metric-card bg-blue-50 border-blue-100">
                                                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">This Month</p>
                                                    <p className="text-2xl font-bold text-blue-700 font-mono mt-1">{thisMonth}</p>
                                                </div>
                                                <div className="metric-card bg-amber-50 border-amber-100">
                                                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">In Review</p>
                                                    <p className="text-2xl font-bold text-amber-600 font-mono mt-1">{review}</p>
                                                </div>
                                                <div className="metric-card bg-emerald-50 border-emerald-100">
                                                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Released</p>
                                                    <p className="text-2xl font-bold text-emerald-600 font-mono mt-1">{released}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="panel-section">
                                            <div className="rs-section-head flex justify-between items-center">
                                                <span>Status Breakdown</span>
                                            </div>
                                            <div className="px-4 pb-4 space-y-4 mt-1">
                                                <StatBar label="Processing" pct={processingPct} color="#3b82f6" />
                                                <StatBar label="Under Review" pct={reviewPct} color="#f59e0b" />
                                                <StatBar label="Released" pct={releasedPct} color="#10b981" />
                                            </div>
                                        </div>

                                        <div className="panel-section pb-4">
                                            <div className="rs-section-head">Recent Applications</div>
                                            <div className="px-4">
                                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                                    <table className="app-table">
                                                        <thead className="bg-slate-50">
                                                            <tr>
                                                                <th>App ID</th>
                                                                <th>Applicant Name</th>
                                                                <th></th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white">
                                                            {[
                                                                ['102-2332', 'Jose R. Manalo'],
                                                                ['102-2438', 'Wally T. Bayola'],
                                                                ['102-2441', 'Maria Santos'],
                                                                ['102-2456', 'Pedro Reyes'],
                                                                ['102-2460', 'Ana Lim'],
                                                            ].map(([id, name]) => (
                                                                <tr key={id}>
                                                                    <td className="font-mono text-slate-500">{id}</td>
                                                                    <td className="font-medium">{name}</td>
                                                                    <td className="text-right"><span className="view-link text-xs">View</span></td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <button className="w-full mt-3 py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                                                    View All Applications
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── Trends Panel ── */}
                                {activeLayer === 'trends' && (
                                    <div>
                                        <div className="p-4 panel-section border-t-0 mt-0">
                                            <div className="grid grid-cols-3 gap-2">
                                                <div className="metric-card bg-slate-50 border-slate-200 text-center px-2 py-3">
                                                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Total Zones</p>
                                                    <p className="text-lg font-bold text-slate-800 font-mono mt-1">203</p>
                                                </div>
                                                <div className="metric-card bg-violet-50 border-violet-200 text-center px-2 py-3">
                                                    <p className="text-[9px] font-bold text-violet-600 uppercase tracking-wide">Dominant</p>
                                                    <p className="text-[11px] font-bold text-violet-800 mt-2 leading-tight">Residential</p>
                                                </div>
                                                <div className="metric-card bg-blue-50 border-blue-200 text-center px-2 py-3">
                                                    <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wide">Avg/Bgy</p>
                                                    <p className="text-lg font-bold text-blue-700 font-mono mt-1">4.2</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="panel-section">
                                            <p className="rs-section-head">Zoning Distribution</p>
                                            <div className="px-4 pb-4">
                                                {landUseData.map(([label, count, pct, color, bg]) => (
                                                    <StatBar key={label} label={label} count={count} pct={pct} color={color} bg={bg} />
                                                ))}
                                            </div>
                                        </div>

                                        <div className="panel-section pb-4">
                                            <p className="rs-section-head">Development Hotspots</p>
                                            <div className="px-4 space-y-2">
                                                {hotspots.map(h => (
                                                    <div key={h.rank} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors">
                                                        <span className="text-[11px] font-bold text-slate-400 font-mono w-4 shrink-0 text-center bg-slate-100 rounded py-0.5">{h.rank}</span>
                                                        <span className="text-[12px] font-semibold text-slate-700 flex-1 truncate">{h.name}</span>
                                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: h.color, background: h.bg }}>{h.type}</span>
                                                        <span className="text-[12px] font-bold text-slate-700 font-mono shrink-0 w-6 text-right">{h.count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── Diversity Panel ── */}
                                {activeLayer === 'diversity' && (
                                    <div>
                                        <div className="p-4 panel-section border-t-0 mt-0">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="metric-card bg-slate-50">
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Diversity Score</p>
                                                    <div className="flex items-end gap-2 mt-2">
                                                        <p className="text-3xl font-bold text-slate-800 font-mono leading-none">0.78</p>
                                                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5 mb-1">High Mix</span>
                                                    </div>
                                                </div>
                                                <div className="metric-card bg-slate-50">
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Clustering</p>
                                                    <div className="flex items-end gap-2 mt-2">
                                                        <p className="text-3xl font-bold text-slate-800 font-mono leading-none">0.42</p>
                                                        <span className="text-[9px] font-bold text-violet-700 bg-violet-100 border border-violet-200 rounded-full px-2 py-0.5 mb-1">Clustered</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-4 bg-gradient-to-br from-indigo-50 to-white rounded-xl p-4 border border-indigo-100 flex items-center justify-between shadow-sm">
                                                <div>
                                                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Dominant Sector</p>
                                                    <p className="text-base font-bold text-slate-800 mt-1">Agro-industrial</p>
                                                    <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Controls 65% of regional mix</p>
                                                </div>
                                                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center border-2 border-white shadow-sm shrink-0">
                                                    <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="panel-section">
                                            <p className="rs-section-head">Composite Mix Analysis</p>
                                            <div className="px-4 pb-4 flex items-center gap-5">
                                                <div className="relative w-[96px] h-[96px] shrink-0 drop-shadow-sm">
                                                    <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
                                                        <circle cx="44" cy="44" r="34" fill="none" stroke="#f1f5f9" strokeWidth="14" />
                                                        <circle cx="44" cy="44" r="34" fill="none" stroke="#8b5cf6" strokeWidth="14"
                                                            strokeDasharray={donutLoaded ? `${(65 / 100) * 213.6} ${213.6 - (65 / 100) * 213.6}` : "0 213.6"}
                                                            strokeDashoffset="0"
                                                            style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.34,1.56,0.64,1)' }} />
                                                        <circle cx="44" cy="44" r="34" fill="none" stroke="#22c55e" strokeWidth="14"
                                                            strokeDasharray={donutLoaded ? `${(25 / 100) * 213.6} ${213.6 - (25 / 100) * 213.6}` : "0 213.6"}
                                                            strokeDashoffset={-((65 / 100) * 213.6)}
                                                            style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.34,1.56,0.64,1) 0.15s' }} />
                                                        <circle cx="44" cy="44" r="34" fill="none" stroke="#f59e0b" strokeWidth="14"
                                                            strokeDasharray={donutLoaded ? `${(10 / 100) * 213.6} ${213.6 - (10 / 100) * 213.6}` : "0 213.6"}
                                                            strokeDashoffset={-((90 / 100) * 213.6)}
                                                            style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.34,1.56,0.64,1) 0.3s' }} />
                                                    </svg>
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <span className="text-[10px] font-bold text-slate-500 text-center leading-tight">Index<br />Ratio</span>
                                                    </div>
                                                </div>
                                                <div className="flex-1 space-y-3">
                                                    <StatBar label="Agro-ind." pct={65} color="#8b5cf6" bg="#f3e8ff" />
                                                    <StatBar label="Residential" pct={25} color="#22c55e" bg="#dcfce7" />
                                                    <StatBar label="Commercial" pct={10} color="#f59e0b" bg="#fef3c7" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </aside>
                    </main>
                </div>
            </div>
        </>
    )
}