import { useEffect, useState, useCallback } from 'react';
import {
  Package,
  Boxes,
  AlertTriangle,
  TrendingDown,
  Clock,
  Wrench,
  Settings,
  ArrowUpCircle,
  ArrowDownCircle,
  SlidersHorizontal,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';
import { supabase, type Product, type Transaction } from '@/lib/supabase';
import AnimatedNumber from '@/components/AnimatedNumber';

type StatConfig = {
  label: string;
  value: number;
  icon: typeof Package;
  gradient: string;
  glow: string;
};

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [recentTxns, setRecentTxns] = useState<(Transaction & { product?: Product })[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [{ data: prodData }, { data: txnsData }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase
        .from('transactions')
        .select('*, product:products(*)')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    setProducts((prodData as Product[]) ?? []);
    setRecentTxns((txnsData as (Transaction & { product?: Product })[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const onFocus = () => loadData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadData]);

  const totalProducts = products.length;
  const totalStock = products.reduce((sum, p) => sum + p.quantity, 0);
  const lowStockItems = products.filter((p) => p.quantity <= p.min_stock && p.quantity > 0);
  const outOfStock = products.filter((p) => p.quantity === 0);
  const toolsCount = products.filter((p) => p.category === 'tool').length;
  const partsCount = products.filter((p) => p.category === 'spare_part').length;

  const stats: StatConfig[] = [
    { label: 'Total Products', value: totalProducts, icon: Package, gradient: 'gradient-icon-blue', glow: 'shadow-navy-glow' },
    { label: 'Available Stock', value: totalStock, icon: Boxes, gradient: 'gradient-icon-green', glow: 'shadow-premium-md' },
    { label: 'Low Stock Alerts', value: lowStockItems.length, icon: AlertTriangle, gradient: 'gradient-icon-amber', glow: 'shadow-amber-glow' },
    { label: 'Out of Stock', value: outOfStock.length, icon: TrendingDown, gradient: 'gradient-icon-red', glow: 'shadow-premium-md' },
  ];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const actionMeta: Record<string, { Icon: typeof ArrowUpCircle; colorClass: string }> = {
    return: { Icon: ArrowUpCircle, colorClass: 'bg-green-100 text-green-700' },
    addition: { Icon: PlusCircle, colorClass: 'bg-green-100 text-green-700' },
    deduction: { Icon: ArrowDownCircle, colorClass: 'bg-red-100 text-red-700' },
    checkout: { Icon: ArrowDownCircle, colorClass: 'bg-red-100 text-red-700' },
    adjustment: { Icon: SlidersHorizontal, colorClass: 'bg-blue-100 text-blue-700' },
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      checkout: 'Checked Out',
      return: 'Returned',
      deduction: 'Deducted',
      addition: 'Stock Added',
      adjustment: 'Adjusted',
    };
    return labels[actionType] ?? actionType;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy-800">Dashboard</h1>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">Overview of your workshop inventory</p>
        </div>
        <button
          onClick={() => { setLoading(true); loadData(); }}
          className="flex items-center gap-2 text-sm font-medium text-navy-700 hover:text-brand-600 bg-white border border-slate-200 px-3.5 py-2.5 rounded-xl transition-all hover:shadow-premium active:scale-95"
        >
          <RefreshCw className="w-4 h-4" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="card-premium p-4 sm:p-5 animate-fade-in-up"
              style={{ animationDelay: `${i * 80}ms`, opacity: 0 }}
            >
              <div className={`inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl ${stat.gradient} ${stat.glow} mb-3`}>
                <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" strokeWidth={2.2} />
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-navy-800 animate-count-up" style={{ animationDelay: `${i * 80 + 200}ms` }}>
                <AnimatedNumber value={stat.value} />
              </p>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
        <div className="card-premium p-5 flex items-center gap-4 animate-fade-in-up" style={{ animationDelay: '320ms', opacity: 0 }}>
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl gradient-icon-blue shadow-navy-glow flex-shrink-0">
            <Settings className="w-7 h-7 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-2xl font-bold text-navy-800">
              <AnimatedNumber value={toolsCount} />
            </p>
            <p className="text-sm text-slate-500 font-medium">Reusable Tools</p>
          </div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4 animate-fade-in-up" style={{ animationDelay: '400ms', opacity: 0 }}>
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl gradient-icon-amber shadow-amber-glow flex-shrink-0">
            <Wrench className="w-7 h-7 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-2xl font-bold text-navy-800">
              <AnimatedNumber value={partsCount} />
            </p>
            <p className="text-sm text-slate-500 font-medium">Spare Parts</p>
          </div>
        </div>
      </div>

      {/* Low stock alerts */}
      {lowStockItems.length > 0 && (
        <div className="card-premium overflow-hidden animate-fade-in-up" style={{ animationDelay: '480ms', opacity: 0 }}>
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 bg-amber-50/50">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl gradient-icon-amber">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <h2 className="font-bold text-navy-800 text-lg">Low Stock Alerts</h2>
            <span className="ml-auto text-sm text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full font-bold">
              {lowStockItems.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {lowStockItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/50 transition-colors">
                <div>
                  <p className="font-semibold text-navy-800">{item.name}</p>
                  <p className="text-sm text-slate-500">{item.brand} · {item.product_code}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-amber-600 text-lg">{item.quantity}</p>
                  <p className="text-xs text-slate-400">min: {item.min_stock}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div className="card-premium overflow-hidden animate-fade-in-up" style={{ animationDelay: '560ms', opacity: 0 }}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl gradient-icon-navy">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <h2 className="font-bold text-navy-800 text-lg">Recent Transactions</h2>
        </div>
        {recentTxns.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No transactions yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentTxns.map((txn) => {
              const meta = actionMeta[txn.action_type] ?? actionMeta.deduction;
              const Icon = meta.Icon;
              const isPositive = txn.quantity_change > 0;

              return (
                <div key={txn.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/50 transition-colors">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${meta.colorClass} flex-shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-navy-800 truncate">
                      {txn.product?.name ?? 'Unknown product'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {getActionLabel(txn.action_type)} · {formatTime(txn.created_at)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {isPositive ? '+' : ''}{txn.quantity_change}
                    </p>
                    <p className="text-xs text-slate-400">Stock: {txn.remaining_quantity}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
