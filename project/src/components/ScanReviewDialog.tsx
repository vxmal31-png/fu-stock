import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { expectedStockAfter, type ActionMode, type ScannedLine } from '@/components/BulkScanTable';

type Props = {
  lines: ScannedLine[];
  mode: ActionMode;
  confirming: boolean;
  confirmError: string | null;
  onBack: () => void;
  onConfirm: () => void;
};

function actionLabel(line: ScannedLine, mode: ActionMode): string {
  if (mode === 'return') return 'Return';
  return line.product.category === 'tool' ? 'Check Out' : 'Deduct';
}

export default function ScanReviewDialog({ lines, mode, confirming, confirmError, onBack, onConfirm }: Props) {
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const hasStockProblem = lines.some((l) => expectedStockAfter(l, mode) < 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-review-title"
        className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div>
            <h2 id="scan-review-title" className="font-bold text-lg text-slate-900">Review Before Deducting</h2>
            <p className="text-sm text-slate-500">
              {lines.length} unique products · {totalQuantity} total units. Stock changes only after you confirm.
            </p>
          </div>
          <button
            onClick={onBack}
            disabled={confirming}
            aria-label="Close review"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-2 sm:px-6 py-2">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Product</th>
                <th className="px-3 py-3 font-semibold">Action</th>
                <th className="px-3 py-3 font-semibold text-right">Qty</th>
                <th className="px-3 py-3 font-semibold text-right">Stock Now</th>
                <th className="px-3 py-3 font-semibold text-right">Stock After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line) => {
                const expected = expectedStockAfter(line, mode);
                return (
                  <tr key={line.product.id}>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">{line.product.name}</p>
                      <p className="text-xs text-slate-500">{line.product.product_code}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{actionLabel(line, mode)}</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900">{line.quantity}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{line.product.quantity}</td>
                    <td className={`px-3 py-3 text-right font-bold ${expected < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                      {expected}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-5 border-t border-slate-100 space-y-3">
          {hasStockProblem && (
            <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Some products do not have enough stock. Go back and adjust the list.
            </p>
          )}
          {confirmError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{confirmError}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onBack}
              disabled={confirming}
              className="sm:w-40 border border-slate-200 text-slate-700 font-medium py-3 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Back to List
            </button>
            <button
              onClick={onConfirm}
              disabled={confirming || hasStockProblem || lines.length === 0}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving photos and updating stock...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Confirm &amp; Deduct Stock
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
