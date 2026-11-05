import { AlertTriangle, Loader2, Minus, Plus, Settings, Trash2, Wrench, XCircle, CheckCircle2 } from 'lucide-react';
import type { Product } from '@/lib/supabase';
import type { ScanPhoto } from '@/lib/scanPhotos';

export type ActionMode = 'auto' | 'checkout' | 'return';
export type ScannedLine = { product: Product; quantity: number; photo: ScanPhoto };

export function expectedStockAfter(line: ScannedLine, mode: ActionMode): number {
  return mode === 'return'
    ? line.product.quantity + line.quantity
    : line.product.quantity - line.quantity;
}

type Props = {
  lines: ScannedLine[];
  mode: ActionMode;
  confirming: boolean;
  onAdjust: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
  onCancel: () => void;
  onReview: () => void;
};

export default function BulkScanTable({ lines, mode, confirming, onAdjust, onRemove, onCancel, onReview }: Props) {
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const hasStockProblem = lines.some((l) => expectedStockAfter(l, mode) < 0);

  return (
    <div className="card-premium overflow-hidden animate-fade-in-up">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-bold text-lg text-navy-800">Scan List</h2>
        <p className="text-sm text-slate-500">
          <span className="font-bold text-navy-800">{lines.length}</span> unique products ·{' '}
          <span className="font-bold text-navy-800">{totalQuantity}</span> total scanned
        </p>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">#</th>
              <th className="px-4 py-3 font-bold">Photo</th>
              <th className="px-4 py-3 font-bold">Product Name</th>
              <th className="px-4 py-3 font-bold">QR Code</th>
              <th className="px-4 py-3 font-bold">Category</th>
              <th className="px-4 py-3 font-bold text-center">Quantity</th>
              <th className="px-4 py-3 font-bold text-right">Current Stock</th>
              <th className="px-4 py-3 font-bold text-right">Expected After</th>
              <th className="px-4 py-3 font-bold text-right">Remove</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, index) => {
              const expected = expectedStockAfter(line, mode);
              const isProblem = expected < 0;
              const canIncrease = mode === 'return' || line.product.quantity > line.quantity;
              return (
                <tr key={line.product.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                  <td className="px-4 py-3">
                    <img
                      src={line.photo.previewUrl}
                      alt={`Captured photo of ${line.product.name}`}
                      className="w-12 h-12 rounded-lg object-cover bg-slate-100"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{line.product.name}</p>
                    <p className="text-xs text-slate-500">{line.product.brand || 'No brand'}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{line.product.product_code}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-700">
                      {line.product.category === 'tool' ? (
                        <Settings className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Wrench className="w-4 h-4 text-purple-500" />
                      )}
                      {line.product.category === 'tool' ? 'Tool' : 'Spare Part'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onAdjust(line.product.id, -1)}
                        disabled={confirming || line.quantity <= 1}
                        aria-label={`Decrease ${line.product.name} quantity`}
                        className="p-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center font-bold text-slate-900">{line.quantity}</span>
                      <button
                        onClick={() => onAdjust(line.product.id, 1)}
                        disabled={confirming || !canIncrease}
                        aria-label={`Increase ${line.product.name} quantity`}
                        className="p-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-navy-700">{line.product.quantity}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 font-bold ${isProblem ? 'text-red-600' : 'text-navy-800'}`}>
                      {isProblem && <AlertTriangle className="w-4 h-4" />}
                      {expected}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onRemove(line.product.id)}
                      disabled={confirming}
                      aria-label={`Remove ${line.product.name}`}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors active:scale-90 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-4 border-t border-slate-100 space-y-3">
        {hasStockProblem && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 font-medium">
            Some products do not have enough stock. Remove them or lower their quantity to continue.
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onCancel}
            disabled={confirming}
            className="sm:w-48 flex items-center justify-center gap-2 border border-slate-200 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50"
          >
            <XCircle className="w-5 h-5" />
            Cancel Scan
          </button>
          <button
            onClick={onReview}
            disabled={confirming || hasStockProblem || lines.length === 0}
            className="flex-1 flex items-center justify-center gap-2 gradient-amber text-navy-800 text-lg font-bold py-3 rounded-xl transition-all hover:shadow-amber-glow active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirming ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Updating stock...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" strokeWidth={2.5} />
                Confirm &amp; Deduct Stock
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
