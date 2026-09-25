import React, { useState, useEffect } from "react";
import { Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import axios from "axios";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";

export default function ReportsIndex({ auth = {} }) {
    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Administrator";

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");
    
    // ── Report Form States ──
    const [reportForm, setReportForm] = useState({
        start_date: '',
        end_date: '',
        application_type: 'All',
        variables: ['reference_number', 'application_type', 'status', 'name', 'barangay', 'land_use_class', 'lot_area_sqm', 'assessment_fee'],
        format: 'pdf',
        presentation_style: 'table',
        aggregation: 'count',
        group_by: 'barangay',
        document_size: 'a4',
        orientation: 'landscape'
    });
    const [generatingReport, setGeneratingReport] = useState(false);
    const [reportTitle, setReportTitle] = useState("");
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [previewData, setPreviewData] = useState(null);

    useEffect(() => {
        let title = "All Applications Report";
        if (reportForm.application_type !== "All") {
            title = `${reportForm.application_type} Report`;
        }
        if (reportForm.start_date && reportForm.end_date) {
            title += ` (${reportForm.start_date} to ${reportForm.end_date})`;
        } else if (reportForm.start_date) {
            title += ` (From ${reportForm.start_date})`;
        } else if (reportForm.end_date) {
            title += ` (Until ${reportForm.end_date})`;
        } else {
            title += ` (All Time)`;
        }
        setReportTitle(title);
    }, [reportForm.application_type, reportForm.start_date, reportForm.end_date]);

    useEffect(() => {
        if (reportForm.format !== 'pdf' && reportForm.presentation_style.includes('_chart')) {
            setReportForm(prev => ({ ...prev, presentation_style: 'summary_table' }));
        }
    }, [reportForm.format]);

    const handleReportFormChange = (e) => {
        const { name, value } = e.target;
        setReportForm(prev => ({ ...prev, [name]: value }));
    };

    const handleVariableToggle = (varId) => {
        setReportForm(prev => {
            const exists = prev.variables.includes(varId);
            if (exists) {
                return { ...prev, variables: prev.variables.filter(v => v !== varId) };
            } else {
                return { ...prev, variables: [...prev.variables, varId] };
            }
        });
    };

    const handleOpenPreview = async () => {
        if (reportForm.variables.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'No variables selected',
                text: 'Please select at least one data column to include in the preview.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }
        
        setLoadingPreview(true);
        try {
            const response = await axios.post('/api/analytics/report/preview', reportForm);
            setPreviewData(response.data);
        } catch (error) {
            console.error("Preview Error:", error);
            Swal.fire({
                icon: 'error',
                title: 'Preview Failed',
                text: 'Could not fetch data for the preview.',
                confirmButtonColor: '#e53e3e'
            });
        } finally {
            setLoadingPreview(false);
        }
    };

    const confirmAndDownload = async () => {
        if (reportForm.variables.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'No variables selected',
                text: 'Please select at least one data column to include in the report.',
                confirmButtonColor: '#2563eb'
            });
            return;
        }

        setGeneratingReport(true);
        try {
            const payload = { ...reportForm };
            const response = await axios.post('/api/analytics/report', payload, {
                responseType: 'blob'
            });
            
            const appTypeStr = (reportForm.application_type && reportForm.application_type !== 'All') 
                ? reportForm.application_type.replace(/ /g, '_') 
                : 'All_Applications';
            let dateStr = 'All_Time';
            if (reportForm.start_date && reportForm.end_date) dateStr = `${reportForm.start_date}_to_${reportForm.end_date}`;
            else if (reportForm.start_date) dateStr = `from_${reportForm.start_date}`;
            else if (reportForm.end_date) dateStr = `until_${reportForm.end_date}`;
            
            const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            const dynamicFilename = `${appTypeStr}_Report_${dateStr}_${timestamp}.${reportForm.format}`;

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', dynamicFilename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            Swal.fire({
                icon: 'success',
                title: 'Report Generated',
                text: 'Your custom report has been downloaded and logged.',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Report Generation Error:", error);
            Swal.fire({
                icon: 'error',
                title: 'Generation Failed',
                text: 'There was an error generating your report. Please try again.',
                confirmButtonColor: '#e53e3e'
            });
        } finally {
            setGeneratingReport(false);
        }
    };

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
        Swal.fire({
            title: "Sign Out?",
            text: "Are you sure you want to log out of iMAPS?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, sign out",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
        }).then((result) => {
            if (result.isConfirmed) {
                sessionStorage.removeItem("hasShownWelcome");
                router.post("/logout");
            }
        });
    };

    return (
        <>
            <Head title="Reports | iMAPS" />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                #analytics-page-root, .swal2-popup {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                }
                .font-mono { font-family: 'JetBrains Mono', monospace !important; }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>

            <div id="analytics-page-root" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={clock}
                    onLogout={handleLogout}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    activePage="reports"
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="reports"
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750] transition-opacity duration-200"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-6 sm:p-8 flex-1 flex flex-col h-full overflow-y-auto max-w-6xl mx-auto w-full gap-6">

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 shrink-0">
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Standard Reports</h1>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Generate custom data reports and export to PDF, CSV, or Excel.
                                    </p>
                                </div>
                            </div>

                            <div className="animate-in fade-in duration-300">
                                <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 mb-6">
                                    <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Report Configuration
                                    </h3>
                                    
                                    <form onSubmit={(e) => e.preventDefault()} className="space-y-7">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-2">Variables Span (Date Range)</label>
                                                <div className="flex items-center gap-3">
                                                    <input 
                                                        type="date" 
                                                        name="start_date"
                                                        value={reportForm.start_date}
                                                        onChange={handleReportFormChange}
                                                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                                                    />
                                                    <span className="text-slate-400 text-sm">to</span>
                                                    <input 
                                                        type="date" 
                                                        name="end_date"
                                                        value={reportForm.end_date}
                                                        onChange={handleReportFormChange}
                                                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-2">Application Type</label>
                                                <select 
                                                    name="application_type"
                                                    value={reportForm.application_type}
                                                    onChange={handleReportFormChange}
                                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none bg-white"
                                                >
                                                    <option value="All">All Types</option>
                                                    <option value="Locational Clearance">Locational Clearance</option>
                                                    <option value="Zoning Certificate">Zoning Certificate</option>
                                                    <option value="Development Permit">Development Permit</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <label className="block text-xs font-bold text-slate-700">Data Columns to Include</label>
                                                <span className="text-[10px] text-slate-400 font-medium italic">Date tracking variables are auto-included.</span>
                                            </div>
                                            <div className="flex flex-wrap gap-2.5">
                                                {[
                                                    { id: 'reference_number', label: 'Reference Number' },
                                                    { id: 'application_type', label: 'Application Type' },
                                                    { id: 'status', label: 'Status' },
                                                    { id: 'name', label: 'Owner Name' },
                                                    { id: 'barangay', label: 'Barangay' },
                                                    { id: 'land_use_class', label: 'Land Use Class' },
                                                    { id: 'lot_area_sqm', label: 'Lot Area (SQM)' },
                                                    { id: 'building_area', label: 'Building Area (SQM)' },
                                                    { id: 'project_cost', label: 'Project Cost' },
                                                    { id: 'purpose', label: 'Purpose' },
                                                    { id: 'assessment_fee', label: 'Assessment Fee' },
                                                ].map((variable) => {
                                                    const isSelected = reportForm.variables.includes(variable.id);
                                                    return (
                                                        <button
                                                            key={variable.id}
                                                            type="button"
                                                            onClick={() => handleVariableToggle(variable.id)}
                                                            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all border ${
                                                                isSelected 
                                                                    ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-sm' 
                                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                                                            }`}
                                                        >
                                                            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                                                                isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'
                                                            }`}>
                                                                {isSelected && (
                                                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            {variable.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-slate-100 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                                            <div className="flex flex-wrap gap-6">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 mb-2">Export Format</label>
                                                    <div className="flex gap-2">
                                                        {['pdf', 'csv', 'xlsx'].map(fmt => (
                                                            <button
                                                                key={fmt}
                                                                type="button"
                                                                onClick={() => setReportForm(prev => ({ ...prev, format: fmt }))}
                                                                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors border ${
                                                                    reportForm.format === fmt 
                                                                        ? 'bg-blue-50 border-blue-600 text-blue-700' 
                                                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                {fmt}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                
                                                {reportForm.format === 'pdf' && (
                                                    <>
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-700 mb-2">Document Size</label>
                                                            <div className="flex gap-2">
                                                                {['a4', 'letter', 'legal'].map(size => (
                                                                    <button
                                                                        key={size}
                                                                        type="button"
                                                                        onClick={() => setReportForm(prev => ({ ...prev, document_size: size }))}
                                                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors border ${
                                                                            reportForm.document_size === size 
                                                                                ? 'bg-blue-50 border-blue-600 text-blue-700' 
                                                                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                                        }`}
                                                                    >
                                                                        {size}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-700 mb-2">Orientation</label>
                                                            <div className="flex gap-2">
                                                                {['landscape', 'portrait'].map(orientation => (
                                                                    <button
                                                                        key={orientation}
                                                                        type="button"
                                                                        onClick={() => setReportForm(prev => ({ ...prev, orientation: orientation }))}
                                                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors border ${
                                                                            reportForm.orientation === orientation 
                                                                                ? 'bg-blue-50 border-blue-600 text-blue-700' 
                                                                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                                        }`}
                                                                    >
                                                                        {orientation}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 mb-2">Presentation Style</label>
                                                    <div className="flex gap-2 flex-wrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => setReportForm(prev => ({ ...prev, presentation_style: 'table' }))}
                                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize tracking-wider transition-colors border ${
                                                                reportForm.presentation_style === 'table' 
                                                                    ? 'bg-blue-50 border-blue-600 text-blue-700' 
                                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            Detailed Table
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setReportForm(prev => ({ ...prev, presentation_style: 'summary_table' }))}
                                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize tracking-wider transition-colors border ${
                                                                reportForm.presentation_style === 'summary_table' 
                                                                    ? 'bg-blue-50 border-blue-600 text-blue-700' 
                                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            Summary Table
                                                        </button>
                                                        {reportForm.format === 'pdf' && (
                                                            <>
                                                                {['bar_chart', 'horizontal_bar_chart', 'line_chart', 'pie_chart', 'doughnut_chart'].map(style => (
                                                                    <button
                                                                        key={style}
                                                                        type="button"
                                                                        onClick={() => setReportForm(prev => ({ ...prev, presentation_style: style }))}
                                                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize tracking-wider transition-colors border ${
                                                                            reportForm.presentation_style === style 
                                                                                ? 'bg-blue-50 border-blue-600 text-blue-700' 
                                                                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                                        }`}
                                                                    >
                                                                        {style.replace(/_/g, ' ')}
                                                                    </button>
                                                                ))}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {reportForm.presentation_style !== 'table' && (
                                                    <>
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-700 mb-2">Group By (X-Axis)</label>
                                                            <select 
                                                                name="group_by"
                                                                value={reportForm.group_by}
                                                                onChange={handleReportFormChange}
                                                                className="w-full text-[11px] font-bold capitalize tracking-wider transition-colors border bg-white border-slate-200 text-slate-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none h-[30px]"
                                                            >
                                                                <option value="status">Status</option>
                                                                <option value="barangay">Barangay</option>
                                                                <option value="application_type">Application Type</option>
                                                                <option value="land_use_class">Land Use Class</option>
                                                                <option value="month">Month</option>
                                                                <option value="year">Year</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-700 mb-2">Aggregation (Y-Axis)</label>
                                                            <select 
                                                                name="aggregation"
                                                                value={reportForm.aggregation}
                                                                onChange={handleReportFormChange}
                                                                className="w-full text-[11px] font-bold capitalize tracking-wider transition-colors border bg-white border-slate-200 text-slate-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none h-[30px]"
                                                            >
                                                                <option value="count">Count (Total Applications)</option>
                                                                <option value="sum_lot_area">Total Lot Area (SQM)</option>
                                                                <option value="avg_lot_area">Average Lot Area (SQM)</option>
                                                                <option value="sum_building_area">Total Building Area (SQM)</option>
                                                                <option value="sum_project_cost">Total Project Cost</option>
                                                                <option value="sum_fee">Total Assessment Fee</option>
                                                            </select>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            
                                            <div className="flex items-center gap-3 w-full lg:w-auto shrink-0 mt-4 lg:mt-0">
                                                <button
                                                    type="button"
                                                    onClick={handleOpenPreview}
                                                    disabled={loadingPreview}
                                                    className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs transition-colors disabled:opacity-70"
                                                >
                                                    {loadingPreview ? (
                                                        <>
                                                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                                                            Loading...
                                                        </>
                                                    ) : 'Preview Data'}
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>

                                {/* ── TABLE PREVIEW CONTAINER ── */}
                                {previewData && (
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden mb-6 animate-in slide-in-from-bottom-4 duration-300 flex flex-col">
                                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                                            <div>
                                                <h3 className="text-base font-bold text-slate-900">{reportTitle}</h3>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    <span className="font-semibold text-slate-700">{reportForm.format.toUpperCase()} Export</span> • {reportForm.presentation_style.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Preview • Showing up to 100 sample records. {previewData.total_rows > 100 && (
                                                        <span className="font-semibold text-blue-600 ml-1">({previewData.total_rows} total matching records)</span>
                                                    )}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={confirmAndDownload}
                                                disabled={generatingReport}
                                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-xs transition-colors disabled:opacity-70 shrink-0"
                                            >
                                                {generatingReport ? (
                                                    <>
                                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                                                        Generating...
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4-4m4 4V4" />
                                                        </svg>
                                                        Download Report
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {reportForm.format === 'pdf' && reportForm.presentation_style !== 'table' && reportForm.presentation_style !== 'summary_table' && previewData.chartData && (
                                            <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center">
                                                <h4 className="text-sm font-bold text-slate-800 mb-4">{previewData.chartData.datasetLabel}</h4>
                                                <img 
                                                    src={`https://quickchart.io/chart?w=1000&h=600&c=${encodeURIComponent(JSON.stringify(previewData.chartData.config))}`}
                                                    className="max-w-full h-auto rounded-lg border border-slate-200 shadow-sm bg-white"
                                                    alt="Chart preview"
                                                />
                                            </div>
                                        )}
                                        
                                        <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                                            <table className="w-full text-left border-collapse">
                                                <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                                                    <tr>
                                                        {previewData.headers.map((h, i) => (
                                                            <th key={i} className="px-5 py-3.5 whitespace-nowrap">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 bg-white text-sm">
                                                    {previewData.rows.length > 0 ? (
                                                        previewData.rows.map((r, rowIdx) => (
                                                            <tr key={rowIdx} className="hover:bg-blue-50/40 transition-colors group">
                                                                {r.map((cell, colIdx) => (
                                                                    <td 
                                                                        key={colIdx} 
                                                                        className="px-5 py-3.5 whitespace-nowrap text-slate-600 group-hover:text-slate-900 max-w-[220px] truncate" 
                                                                        title={cell || ''}
                                                                    >
                                                                        {cell !== null && cell !== '' ? cell : <span className="text-slate-300 italic">N/A</span>}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={previewData.headers.length} className="px-5 py-12 text-center">
                                                                <svg className="w-10 h-10 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                                                </svg>
                                                                <p className="font-medium text-slate-600">No data found</p>
                                                                <p className="text-xs text-slate-400 mt-1">Try adjusting your filters.</p>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}