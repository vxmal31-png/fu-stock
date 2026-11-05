import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Package,
  ScanLine,
  History,
  Printer,
  Wrench,
  Menu,
  X,
} from 'lucide-react';

export type PageId = 'dashboard' | 'products' | 'scanner' | 'history' | 'qr-print';

type NavItem = {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
};

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'scanner', label: 'Scanner', icon: ScanLine },
  { id: 'history', label: 'History', icon: History },
  { id: 'qr-print', label: 'QR Print', icon: Printer },
];

export default function AppLayout({
  currentPage,
  onNavigate,
  children,
}: {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavigate = (page: PageId) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FC] flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-72 gradient-navy flex-col fixed inset-y-0 z-30">
        <div className="flex items-center gap-3 px-6 h-20 border-b border-white/5">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl gradient-amber shadow-amber-glow">
            <Wrench className="w-6 h-6 text-navy-800" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">Fu-Glide AutoNex</p>
            <p className="text-brand-300 text-xs font-medium tracking-wide">Stock Manager</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto scrollbar-thin">
          <p className="text-brand-300/60 text-[10px] font-bold uppercase tracking-widest px-3 mb-3">Menu</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`group w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  active
                    ? 'bg-white text-navy-800 shadow-premium-lg'
                    : 'text-brand-200 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon
                  className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${
                    active ? 'scale-110' : 'group-hover:scale-110'
                  }`}
                />
                {item.label}
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500" />}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-5 border-t border-white/5">
          <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-white/5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl gradient-icon-blue">
              <Wrench className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-white text-xs font-semibold">Workshop Mode</p>
              <p className="text-brand-300 text-[10px]">Active</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 gradient-navy h-16 flex items-center justify-between px-4 shadow-premium-md">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl gradient-amber">
            <Wrench className="w-5 h-5 text-navy-800" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Fu-Glide AutoNex</p>
            <p className="text-brand-300 text-[10px] font-medium">Stock Manager</p>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-white p-2 -mr-2 active:scale-90 transition-transform"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-20" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm animate-fade-in" />
          <div
            className="absolute top-16 left-0 right-0 gradient-navy border-b border-white/5 shadow-premium-lg animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="px-4 py-4 space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                      active ? 'bg-white text-navy-800' : 'text-brand-200 active:bg-white/5'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-72 pt-16 md:pt-0 min-h-screen pb-20 md:pb-0">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-premium-lg">
        <div className="flex items-center justify-around px-1 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all active:scale-90 ${
                  active ? 'text-brand-500' : 'text-slate-400'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110' : ''}`} strokeWidth={active ? 2.5 : 2} />
                <span className={`text-[10px] font-semibold ${active ? 'text-navy-800' : ''}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
