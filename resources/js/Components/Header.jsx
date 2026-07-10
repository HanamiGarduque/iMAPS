export default function Header({ userName, userRole, clock, onLogout }) {
    return (
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
    );
}
