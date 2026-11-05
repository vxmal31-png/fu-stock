import { supabase } from '@/lib/supabase';

export const SCAN_PHOTO_BUCKET = 'scan-photos';

const PHOTO_MAX_WIDTH = 960;
const PHOTO_QUALITY = 0.85;

export type ScanPhoto = { blob: Blob; previewUrl: string };

export async function captureFrameAsBlob(video: HTMLVideoElement): Promise<Blob | null> {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  const scale = Math.min(1, PHOTO_MAX_WIDTH / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', PHOTO_QUALITY);
  });
}

export async function uploadScanPhoto(blob: Blob): Promise<string> {
  const fileName = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(SCAN_PHOTO_BUCKET)
    .upload(fileName, blob, { contentType: 'image/jpeg', cacheControl: '3600' });

  if (error) throw new Error(error.message);
  return fileName;
}
