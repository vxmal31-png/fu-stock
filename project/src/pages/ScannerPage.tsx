import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  ScanLine,
  Camera,
  VideoOff,
  RefreshCw,
  Pause,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Info,
} from 'lucide-react';
import {
  supabase,
  getSessionId,
  type BulkConfirmItem,
  type BulkConfirmResult,
  type Product,
} from '@/lib/supabase';
import BulkScanTable, { type ActionMode, type ScannedLine } from '@/components/BulkScanTable';
import ScanReviewDialog from '@/components/ScanReviewDialog';
import { captureFrameAsBlob, uploadScanPhoto } from '@/lib/scanPhotos';

const SCAN_COOLDOWN_MS = 2000;

const MODES = [
  { id: 'auto', label: 'Auto' },
  { id: 'checkout', label: 'Check Out / Deduct' },
  { id: 'return', label: 'Return Tool' },
] as const;

const ACTION_LABELS: Record<BulkConfirmItem['action'], string> = {
  checkout: 'Check Out',
  deduction: 'Deduct',
  return: 'Return',
};

type Notice = { tone: 'error' | 'info'; text: string };
type LastScan = { productId: string; name: string; qrCode: string; previewUrl: string };

function isBulkConfirmResult(value: unknown): value is BulkConfirmResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as BulkConfirmResult).success === true &&
    Array.isArray((value as BulkConfirmResult).items)
  );
}

function describeCameraError(err: unknown): string {
  const error = err as DOMException;
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    return 'Camera permission was denied. Please allow camera access in your browser settings and try again.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'No camera device was found. Please connect a camera and try again.';
  }
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'Your camera is already in use by another app. Please close it and try again.';
  }
  if (error?.name === 'NotSupportedError') {
    return 'Your browser does not support camera access. Camera requires HTTPS (or localhost). Please use a modern browser over a secure connection.';
  }
  if (
    window.location.protocol !== 'https:' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return 'Camera access requires HTTPS. This site is not on a secure connection. Please use the HTTPS version of the site.';
  }
  return 'Cannot access the camera.';
}

export default function ScannerPage() {
  const [actionMode, setActionMode] = useState<ActionMode>('auto');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lines, setLines] = useState<ScannedLine[]>([]);
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BulkConfirmResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const linesRef = useRef<ScannedLine[]>([]);
  const confirmingRef = useRef(false);
  const actionModeRef = useRef<ActionMode>(actionMode);
  const confirmKeyRef = useRef<string | null>(null);
  const lastSeenRef = useRef(new Map<string, number>());
  const handleDecodedRef = useRef<(token: string) => void>(() => {});

  useEffect(() => {
    actionModeRef.current = actionMode;
  }, [actionMode]);

  const commitLines = useCallback((next: ScannedLine[]) => {
    linesRef.current = next;
    setLines(next);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    scanningRef.current = false;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsScanning(false);
  }, []);

  const clearSession = useCallback(() => {
    linesRef.current.forEach((l) => URL.revokeObjectURL(l.photo.previewUrl));
    commitLines([]);
    confirmKeyRef.current = null;
    lastSeenRef.current.clear();
    setLastScan(null);
    setNotice(null);
    setConfirmError(null);
    setReviewOpen(false);
  }, [commitLines]);

  const addScannedProduct = useCallback(
    async (token: string) => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('qr_token', token)
        .maybeSingle();

      if (confirmingRef.current) return;

      if (error) {
        setNotice({ tone: 'error', text: `Could not look up that QR code: ${error.message}` });
        return;
      }
      if (!data) {
        setNotice({ tone: 'error', text: 'Unknown QR code: this code is not registered to any product.' });
        return;
      }

      const product = data as Product;

      if (actionModeRef.current === 'return') {
        if (product.category !== 'tool') {
          setNotice({ tone: 'error', text: `${product.name} is a spare part. Only tools can be returned.` });
          return;
        }
      } else if (product.quantity < 1) {
        setNotice({ tone: 'error', text: `Out of Stock: ${product.name} has no units available.` });
        return;
      }

      if (!videoRef.current) return;
      const blob = await captureFrameAsBlob(videoRef.current);
      if (confirmingRef.current) return;
      if (!blob) {
        setNotice({ tone: 'error', text: 'Could not capture a photo of the product. Hold the code steady and scan again.' });
        return;
      }
      if (linesRef.current.some((l) => l.product.id === product.id)) {
        setNotice({ tone: 'info', text: `${product.name} is already in the list. Use + in the list to add another unit.` });
        return;
      }

      const previewUrl = URL.createObjectURL(blob);
      commitLines([...linesRef.current, { product, quantity: 1, photo: { blob, previewUrl } }]);
      setLastScan({ productId: product.id, name: product.name, qrCode: product.product_code, previewUrl });
      setNotice(null);
      setSummary(null);
      setConfirmError(null);
    },
    [commitLines]
  );

  const handleDecoded = useCallback(
    (token: string) => {
      if (confirmingRef.current) return;
      const now = Date.now();
      const last = lastSeenRef.current.get(token) ?? 0;
      if (now - last < SCAN_COOLDOWN_MS) return;
      lastSeenRef.current.set(token, now);

      const alreadyListed = linesRef.current.find((l) => l.product.qr_token === token);
      if (alreadyListed) {
        setNotice({
          tone: 'info',
          text: `${alreadyListed.product.name} is already in the list. Use + in the list to add another unit.`,
        });
        return;
      }
      void addScannedProduct(token);
    },
    [addScannedProduct]
  );

  useEffect(() => {
    handleDecodedRef.current = handleDecoded;
  }, [handleDecoded]);

  const scanLoop = useCallback(() => {
    if (!scanningRef.current || !videoRef.current) return;

    const video = videoRef.current;
    if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvasRef.current = canvas;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(video, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' });
        if (code?.data) handleDecodedRef.current(code.data.trim());
      }
    }
    requestAnimationFrame(scanLoop);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setIsScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }
      scanningRef.current = true;
      requestAnimationFrame(scanLoop);
    } catch (err) {
      stopCamera();
      setCameraError(describeCameraError(err));
    }
  }, [scanLoop, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
      linesRef.current.forEach((l) => URL.revokeObjectURL(l.photo.previewUrl));
    };
  }, [stopCamera]);

  const adjustQuantity = (productId: string, delta: number) => {
    const line = linesRef.current.find((l) => l.product.id === productId);
    if (!line) return;
    const nextQuantity = line.quantity + delta;
    if (nextQuantity < 1) return;
    if (actionModeRef.current !== 'return' && line.product.quantity < nextQuantity) {
      setNotice({ tone: 'error', text: `Only ${line.product.quantity} unit(s) of ${line.product.name} are in stock.` });
      return;
    }
    setNotice(null);
    setConfirmError(null);
    commitLines(
      linesRef.current.map((l) => (l.product.id === productId ? { ...l, quantity: nextQuantity } : l))
    );
  };

  const handleRemove = (productId: string) => {
    if (confirmingRef.current) return;
    const removed = linesRef.current.find((l) => l.product.id === productId);
    if (removed) {
      URL.revokeObjectURL(removed.photo.previewUrl);
      setLastScan((prev) => (prev?.productId === productId ? null : prev));
    }
    commitLines(linesRef.current.filter((l) => l.product.id !== productId));
    setConfirmError(null);
    if (linesRef.current.length === 0) setReviewOpen(false);
  };

  const handleCancel = () => {
    if (confirmingRef.current) return;
    stopCamera();
    clearSession();
    setSummary(null);
  };

  const openReview = () => {
    if (linesRef.current.length === 0) return;
    stopCamera();
    setConfirmError(null);
    setReviewOpen(true);
  };

  const handleConfirm = async () => {
    if (confirmingRef.current || linesRef.current.length === 0) return;
    confirmingRef.current = true;
    setConfirming(true);
    setConfirmError(null);
    stopCamera();

    if (!confirmKeyRef.current) confirmKeyRef.current = crypto.randomUUID();

    try {
      const currentLines = linesRef.current;

      let photoPaths: string[];
      try {
        photoPaths = await Promise.all(currentLines.map((l) => uploadScanPhoto(l.photo.blob)));
      } catch (uploadErr) {
        const detail = uploadErr instanceof Error ? uploadErr.message : 'unknown error';
        throw new Error(`Could not save the product photos (${detail}). Stock was not changed. Please try again.`);
      }

      const items = currentLines.map((l, index) => ({
        product_id: l.product.id,
        quantity: l.quantity,
        photo_path: photoPaths[index],
      }));

      const { data, error } = await supabase.rpc('bulk_confirm_scan', {
        p_items: items,
        p_mode: actionModeRef.current,
        p_session_id: getSessionId(),
        p_confirm_key: confirmKeyRef.current,
        p_notes: '',
      });

      if (error || !isBulkConfirmResult(data)) {
        throw new Error(
          error?.message ?? 'The server returned an unexpected response. Your list has been kept, so you can try again.'
        );
      }

      clearSession();
      setSummary(data);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Something went wrong. Your list has been kept.');
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  };

  const hasLines = lines.length > 0;
  const lastScanQuantity = lastScan ? lines.find((l) => l.product.id === lastScan.productId)?.quantity : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">QR Scanner</h1>
        <p className="text-slate-500 mt-1">
          Scan products one after another, review the list, then confirm to deduct stock.
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-white border border-slate-200 rounded-xl w-fit">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setActionMode(m.id)}
            disabled={hasLines || confirming}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:cursor-not-allowed ${
              actionMode === m.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
            } disabled:opacity-60`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {hasLines && (
        <p className="text-xs text-slate-500 -mt-4">Cancel or confirm the scan list to change the mode.</p>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="relative">
          <video
            ref={videoRef}
            className={`w-full max-h-[50vh] object-contain bg-black ${isScanning ? '' : 'hidden'}`}
            playsInline
            muted
            autoPlay
          />
          {isScanning && (
            <>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-56 h-56 border-2 border-amber-400/80 rounded-2xl">
                  <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-white text-sm font-medium flex items-center gap-2">
                    <ScanLine className="w-5 h-5 animate-pulse" />
                    Point at a product QR code
                  </p>
                  <button
                    onClick={stopCamera}
                    className="flex items-center gap-1.5 text-white text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {!isScanning && (
          <div className="p-8 text-center">
            <div
              className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${
                cameraError ? 'bg-red-50' : 'bg-amber-50'
              }`}
            >
              {cameraError ? (
                <VideoOff className="w-8 h-8 text-red-500" />
              ) : (
                <Camera className="w-8 h-8 text-amber-500" />
              )}
            </div>
            {cameraError ? (
              <p className="text-slate-500 text-sm mb-5 max-w-sm mx-auto">{cameraError}</p>
            ) : (
              <p className="text-slate-500 text-sm mb-5 max-w-sm mx-auto">
                {hasLines
                  ? 'Scanning is paused. Resume to add more products to the list.'
                  : 'Start scanning, then point the camera at each product QR code in turn.'}
              </p>
            )}
            <button
              onClick={startCamera}
              disabled={confirming || reviewOpen}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-6 py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {cameraError ? <RefreshCw className="w-5 h-5" /> : <ScanLine className="w-5 h-5" />}
              {cameraError ? 'Try Again' : hasLines ? 'Resume Scanning' : 'Start Scanning'}
            </button>
          </div>
        )}

        {notice && (
          <div
            className={`mx-5 mb-5 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
              notice.tone === 'error'
                ? 'bg-red-50 border border-red-200 text-red-700'
                : 'bg-blue-50 border border-blue-200 text-blue-800'
            }`}
          >
            {notice.tone === 'error' ? (
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <Info className="w-5 h-5 flex-shrink-0" />
            )}
            {notice.text}
          </div>
        )}

        {lastScan && (
          <div className="mx-5 mb-5 flex flex-col sm:flex-row gap-4 items-center rounded-xl border border-green-200 bg-green-50 p-4">
            <img
              src={lastScan.previewUrl}
              alt={`Captured photo of ${lastScan.name}`}
              className="w-28 h-28 rounded-lg object-cover bg-white flex-shrink-0"
            />
            <div className="text-center sm:text-left">
              <p className="flex items-center justify-center sm:justify-start gap-2 font-bold text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                Product Scanned Successfully!
              </p>
              <p className="font-semibold text-slate-900 mt-1">{lastScan.name}</p>
              <p className="text-xs text-slate-500">QR Code: {lastScan.qrCode}</p>
              <p className="text-sm text-slate-700 mt-1">
                Quantity in list: <span className="font-bold">{lastScanQuantity ?? 1}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {summary && (
        <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-50">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-slate-900">Stock Updated</h2>
                <p className="text-sm text-slate-500">
                  {summary.replayed
                    ? 'This confirmation was already processed earlier, so stock was not changed again.'
                    : `${summary.items.length} products processed and recorded in Stock History with their photos.`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSummary(null)}
              className="flex items-center gap-2 border border-slate-200 text-slate-700 text-sm font-medium px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <ClipboardList className="w-4 h-4" />
              Dismiss
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product Name</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold text-right">Quantity</th>
                  <th className="px-4 py-3 font-semibold text-right">Previous Stock</th>
                  <th className="px-4 py-3 font-semibold text-right">Updated Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.items.map((item) => (
                  <tr key={item.product_id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{item.product_name}</td>
                    <td className="px-4 py-3 text-slate-700">{ACTION_LABELS[item.action]}</td>
                    <td className="px-4 py-3 text-right text-slate-900">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{item.previous_stock}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{item.new_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!summary && hasLines && (
        <BulkScanTable
          lines={lines}
          mode={actionMode}
          confirming={confirming}
          onAdjust={adjustQuantity}
          onRemove={handleRemove}
          onCancel={handleCancel}
          onReview={openReview}
        />
      )}

      {!summary && !hasLines && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No products scanned yet. Scanned products will appear here.</p>
        </div>
      )}

      {reviewOpen && hasLines && (
        <ScanReviewDialog
          lines={lines}
          mode={actionMode}
          confirming={confirming}
          confirmError={confirmError}
          onBack={() => setReviewOpen(false)}
          onConfirm={handleConfirm}
        />
      )}

      <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 flex gap-3">
        <div className="flex-shrink-0">
          <ScanLine className="w-5 h-5" />
        </div>
        <div>
          <p className="font-medium mb-1">How it works</p>
          <ul className="space-y-1 text-blue-700 text-xs">
            <li>• Each scan captures a photo of the product and adds it to the list. Stock is not changed yet.</li>
            <li>• A product that is already in the list is not added twice. Use + in the list to add more units.</li>
            <li>• Confirm &amp; Deduct Stock shows a summary first, then updates every product and its history together, or nothing at all.</li>
            <li>• Tools are checked out, and spare parts are deducted. In Return Tool mode, only tools can be scanned.</li>
            <li>• Camera access requires HTTPS or localhost. On mobile, use the deployed HTTPS site.</li>
          </ul>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
