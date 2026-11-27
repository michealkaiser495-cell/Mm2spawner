import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Notice } from '../ui/primitives';

/** Strip common URI schemes (bitcoin:, ethereum:, solana:, litecoin:, dogecoin:) and params. */
function cleanAddress(raw: string): string {
  let s = raw.trim();
  const colon = s.indexOf(':');
  if (colon > 0 && colon < 12 && /^[a-z]+$/i.test(s.slice(0, colon))) s = s.slice(colon + 1);
  const q = s.indexOf('?');
  if (q >= 0) s = s.slice(0, q);
  return s.trim();
}

export function QrScanner({ open, onOpenChange, onScan }: { open: boolean; onOpenChange: (v: boolean) => void; onScan: (address: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>();
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(undefined);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const v = videoRef.current;
      if (!cancelled && v && v.readyState === v.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          onScan(cleanAddress(code.data));
          onOpenChange(false);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch((e) => setError(e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access to scan.' : 'No camera available on this device.'));

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onScan, onOpenChange]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Scan QR code" description="Point your camera at a wallet address QR code.">
      {error ? (
        <Notice tone="danger" title="Can't use camera">
          {error}
        </Notice>
      ) : (
        <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-white/70" />
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5 text-xs text-white/80">
            <Camera className="h-3.5 w-3.5" /> Scanning…
          </div>
        </div>
      )}
    </Modal>
  );
}
