import { useEffect, useState } from 'react';
import {
  History,
  ArrowUpCircle,
  ArrowDownCircle,
  Search,
  Filter,
  Settings,
  Wrench,
  SlidersHorizontal,
  PlusCircle,
  FileText,
} from 'lucide-react';
import { supabase, type Transaction, type Product } from '@/lib/supabase';

type TxnWithRelations = Transaction & { product?: Product };

export default function HistoryPage() {
  const [transactions, setTransactions] = useState<TxnWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState<'all' | 'checkout' | 'return' | 'deduction' | 'addition' | 'adjustment'>('all');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*, product:products(*)')
        .order('created_at', { ascending: false })
        .limit(200);
      setTransactions((data as TxnWithRelations[]) ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = transactions.filter((t) => {
    const matchesSearch =
      t.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.product?.product_code?.toLowerCase().includes(search.toLowerCase()) ||
      t.notes?.toLowerCase().includes(search.toLowerCase());
    const matchesAction = filterAction === 'all' || t.action_type === filterAction;
    return matchesSearch && matchesAction;
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const actionMeta: Record<string, { Icon: typeof ArrowUpCircle; colorClass: string; label: string }> = {
    return: { Icon: ArrowUpCircle, colorClass: 'bg-green-100 text-green-700', label: 'Return' },
    addition: { Icon: PlusCircle, colorClass: 'bg-green-100 text-green-700', label: 'Addition' },
    deduction: { Icon: ArrowDownCircle, colorClass: 'bg-red-100 text-red-700', label: 'Deduction' },
    checkout: { Icon: ArrowDownCircle, colorClass: 'bg-red-100 text-red-700', label: 'Checkout' },
    adjustment: { Icon: SlidersHorizontal, colorClass: 'bg-blue-100 text-blue-700', label: 'Adjustment' },
  };

  const filterOptions = ['all', 'checkout', 'return', 'deduction', 'addition', 'adjustment'] as const;

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy-800">Stock History</h1>
        <p className="text-slate-500 mt-1 text-sm sm:text-base">All stock movements and transactions</p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name, ID, or notes..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-navy-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl overflow-x-auto scrollbar-thin">
          <Filter className="w-4 h-4 text-slate-400 ml-2 mr-0.5 flex-shrink-0" />
          {filterOptions.map((a) => (
            <button
              key={a}
              onClick={() => setFilterAction(a)}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-all capitalize whitespace-nowrap ${
                filterAction === a
                  ? 'gradient-navy text-white shadow-premium'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {a === 'all' ? 'All' : a}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-premium p-12 text-center text-slate-400">
          <History className="w-14 h-14 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-slate-500">No transactions found</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block card-premium overflow-hidden animate-fade-in-up" style={{ animationDelay: '120ms' }}>
            <table className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wide px-5 py-3.5">Product</th>
                  <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wide px-5 py-3.5">Action</th>
                  <th className="text-center text-xs font-bold text-slate-500 uppercase tracking-wide px-5 py-3.5">Prev</th>
                  <th className="text-center text-xs font-bold text-slate-500 uppercase tracking-wide px-5 py-3.5">Change</th>
                  <th className="text-center text-xs font-bold text-slate-500 uppercase tracking-wide px-5 py-3.5">Stock</th>
                  <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wide px-5 py-3.5">Notes</th>
                  <th className="text-right text-xs font-bold text-slate-500 uppercase tracking-wide px-5 py-3.5">Date / Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((t, i) => {
                  const meta = actionMeta[t.action_type] ?? actionMeta.deduction;
                  const Icon = meta.Icon;
                  const isPositive = t.quantity_change > 0;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors" style={{ animationDelay: `${i * 20}ms` }}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          {t.product?.category === 'tool' ? (
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg gradient-icon-blue flex-shrink-0">
                              <Settings className="w-4 h-4 text-white" />
                            </div>
                          ) : (
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg gradient-icon-amber flex-shrink-0">
                              <Wrench className="w-4 h-4 text-white" />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-navy-800 text-sm">{t.product?.name ?? 'Unknown'}</p>
                            <p className="text-xs text-slate-400 font-medium">{t.product?.product_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${meta.colorClass}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center text-sm font-medium text-slate-500">
                        {t.previous_stock}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`font-bold text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                          {isPositive ? '+' : ''}{t.quantity_change}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-bold text-navy-800 text-sm">
                        {t.remaining_quantity}
                      </td>
                      <td className="px-5 py-3.5 max-w-[200px]">
                        {t.notes ? (
                          <span className="text-sm text-slate-600 truncate inline-flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            {t.notes}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm text-slate-500">
                        <p className="font-medium">{formatDate(t.created_at)}</p>
                        <p className="text-xs text-slate-400">{formatTime(t.created_at)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((t, i) => {
              const meta = actionMeta[t.action_type] ?? actionMeta.deduction;
              const Icon = meta.Icon;
              const isPositive = t.quantity_change > 0;
              return (
                <div key={t.id} className="card-premium p-4 animate-fade-in-up" style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      {t.product?.category === 'tool' ? (
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg gradient-icon-blue">
                          <Settings className="w-4 h-4 text-white" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg gradient-icon-amber">
                          <Wrench className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-navy-800 text-sm">{t.product?.name ?? 'Unknown'}</p>
                        <p className="text-xs text-slate-400 font-medium">{t.product?.product_code}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${meta.colorClass}`}>
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <div className="text-center flex-1">
                      <p className="text-slate-400 text-xs font-medium">Prev</p>
                      <p className="font-semibold text-slate-600">{t.previous_stock}</p>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-slate-400 text-xs font-medium">Change</p>
                      <p className={`font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? '+' : ''}{t.quantity_change}
                      </p>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-slate-400 text-xs font-medium">Stock</p>
                      <p className="font-bold text-navy-800">{t.remaining_quantity}</p>
                    </div>
                  </div>
                  {t.notes && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 mb-2">
                      <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{t.notes}</span>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 font-medium">
                    {formatDate(t.created_at)} · {formatTime(t.created_at)}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
