import { useEffect, useState, useRef } from 'react';
import {
  Printer,
  Search,
  QrCode as QrIcon,
  Loader2,
  Settings,
  Wrench,
  Package,
  Check,
} from 'lucide-react';
import QRCode from 'qrcode';
import { supabase, type Product } from '@/lib/supabase';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function QrPrintPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const printRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
      setProducts((data as Product[]) ?? []);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    const generate = async () => {
      const urls: Record<string, string> = {};
      for (const p of products) {
        if (qrDataUrls[p.id]) {
          urls[p.id] = qrDataUrls[p.id];
          continue;
        }
        try {
          const url = await QRCode.toDataURL(p.qr_token, {
            width: 300,
            margin: 1,
            color: { dark: '#101B35', light: '#ffffff' },
          });
          urls[p.id] = url;
        } catch {
          // skip
        }
      }
      setQrDataUrls(urls);
    };
    if (products.length > 0) generate();
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.product_code.toLowerCase().includes(search.toLowerCase()) ||
      p.brand.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    setSelected(new Set(filtered.map((p) => p.id)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handlePrint = () => {
    const selectedProducts = products.filter((p) => selected.has(p.id));
    if (selectedProducts.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const cards = selectedProducts
      .map((p) => {
        const qrUrl = escapeHtml(qrDataUrls[p.id] ?? '');
        return `
        <div class="qr-card">
          <div class="qr-card-header">
            <span class="qr-category">${p.category === 'tool' ? 'Tool' : 'Spare Part'}</span>
          </div>
          <div class="qr-image">
            <img src="${qrUrl}" alt="QR Code" />
          </div>
          <div class="qr-code">${escapeHtml(p.product_code)}</div>
          <div class="qr-name">${escapeHtml(p.name)}</div>
          <div class="qr-brand">${escapeHtml(p.brand || '')}</div>
          <div class="qr-footer">Fu-Glide AutoNex</div>
        </div>`;
      })
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Codes — Fu-Glide AutoNex</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; background: #fff; padding: 20px; }
          .header { text-align: center; margin-bottom: 20px; }
          .header h1 { font-size: 20px; color: #101B35; }
          .header p { font-size: 13px; color: #64748b; margin-top: 4px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 800px; margin: 0 auto; }
          .qr-card { border: 2px solid #101B35; border-radius: 12px; padding: 16px; text-align: center; page-break-inside: avoid; }
          .qr-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
          .qr-code { font-weight: bold; font-size: 14px; color: #101B35; }
          .qr-category { font-size: 10px; text-transform: uppercase; background: #eff5ff; padding: 2px 8px; border-radius: 99px; color: #2563EB; }
          .qr-image img { width: 180px; height: 180px; }
          .qr-name { font-weight: bold; font-size: 13px; color: #101B35; margin-top: 8px; }
          .qr-brand { font-size: 11px; color: #64748b; margin-top: 2px; }
          .qr-footer { font-size: 10px; color: #94a3b8; margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 6px; }
          @media print { .header { display: none; } body { padding: 10px; } }
          @media (max-width: 600px) { .grid { grid-template-columns: repeat(2, 1fr); } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>QR Code Labels</h1>
          <p>Fu-Glide AutoNex — ${selectedProducts.length} product(s)</p>
        </div>
        <div class="grid">${cards}</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy-800">QR Printing</h1>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">Select products and print their QR code labels</p>
        </div>
        <button
          onClick={handlePrint}
          disabled={selected.size === 0}
          className="flex items-center gap-2 gradient-amber text-navy-800 font-bold px-4 py-2.5 rounded-xl transition-all hover:shadow-amber-glow active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Printer className="w-5 h-5" strokeWidth={2.5} />
          <span className="text-sm">Print {selected.size > 0 ? `(${selected.size})` : ''}</span>
        </button>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-navy-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={selectAll} className="px-4 py-3 text-sm font-semibold text-navy-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-95 transition-all">
            Select All
          </button>
          <button onClick={selectNone} className="px-4 py-3 text-sm font-semibold text-navy-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-95 transition-all">
            Clear
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-premium p-12 text-center text-slate-400">
          <Package className="w-14 h-14 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-slate-500">No products found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filtered.map((p, i) => {
            const isSelected = selected.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleSelect(p.id)}
                className={`relative bg-white rounded-2xl border-2 p-4 text-center transition-all animate-fade-in-up active:scale-95 ${
                  isSelected
                    ? 'border-amber-500 shadow-premium-lg ring-2 ring-amber-200'
                    : 'border-slate-200 hover:border-brand-300 hover:shadow-premium'
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {isSelected && (
                  <div className="absolute -top-2 -right-2 w-7 h-7 gradient-amber rounded-full flex items-center justify-center shadow-amber-glow">
                    <Check className="w-4 h-4 text-navy-800" strokeWidth={3} />
                  </div>
                )}
                <div className="flex justify-end mb-2">
                  {p.category === 'tool' ? (
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg gradient-icon-blue">
                      <Settings className="w-3.5 h-3.5 text-white" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg gradient-icon-amber">
                      <Wrench className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </div>
                {qrDataUrls[p.id] ? (
                  <img src={qrDataUrls[p.id]} alt="QR" className="w-full aspect-square object-contain mb-2" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center bg-slate-50 rounded-xl mb-2">
                    <Loader2 className="w-7 h-7 text-slate-300 animate-spin" />
                  </div>
                )}
                <p className="text-xs font-bold text-navy-800">{p.product_code}</p>
                <p className="font-semibold text-navy-800 text-sm leading-tight mt-0.5">{p.name}</p>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">{p.brand}</p>
              </button>
            );
          })}
        </div>
      )}

      <div ref={printRef} className="hidden" />
    </div>
  );
}
