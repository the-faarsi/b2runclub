import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal shape of the platform BarcodeDetector we rely on. It is not in
 * TypeScript's DOM lib yet, so it is declared locally rather than pulled in with
 * an `any`.
 */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

/** True when this browser can decode QR codes natively. */
export function scannerSupported(): boolean {
  return Boolean(getDetectorCtor() && navigator.mediaDevices?.getUserMedia);
}

export type ScannerState = "idle" | "starting" | "running" | "denied" | "unsupported" | "error";

/**
 * Camera QR scanner built on the platform BarcodeDetector.
 *
 * Deliberately no QR-decoding dependency: a WASM decoder is ~300 KB, and every
 * browser that can realistically be used at a start line (Chrome and Android
 * WebView; Safari 17+) ships BarcodeDetector. Where it is missing, the caller
 * falls back to manual entry rather than shipping the polyfill to everyone.
 *
 * Frames are sampled on an interval rather than every animation frame — decoding
 * at 60 fps drains a phone battery for no gain at a check-in desk.
 */
export function QrScanner({
  onScan,
  paused = false,
  className,
}: {
  /** Called with the raw QR text. Repeats of the same code are suppressed. */
  onScan: (text: string) => void;
  /** Stops decoding without tearing down the camera — used while a result shows. */
  paused?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  const [state, setState] = useState<ScannerState>("idle");
  const [detail, setDetail] = useState<string | null>(null);

  // `paused` is read inside the interval; a ref avoids restarting the camera
  // every time it flips.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const Ctor = getDetectorCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }

    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Rear camera on a phone; falls back to whatever exists on a laptop.
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setState("running");
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setState("denied");
      } else {
        setState("error");
        setDetail(err instanceof Error ? err.message : "Could not open the camera");
      }
      stop();
    }
  }, [stop]);

  // Decode loop. Only mounted while the camera is actually running.
  useEffect(() => {
    if (state !== "running") return;

    const Ctor = getDetectorCtor();
    if (!Ctor) return;
    const detector = new Ctor({ formats: ["qr_code"] });

    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    let cancelled = false;
    let busy = false;

    const tick = async () => {
      if (cancelled || busy || pausedRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !ctx) return;

      busy = true;
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const codes = await detector.detect(canvas);
        const text = codes[0]?.rawValue;

        if (text) {
          const now = Date.now();
          // Suppress the same code re-firing while it sits in frame.
          if (text !== lastRef.current.text || now - lastRef.current.at > 3000) {
            lastRef.current = { text, at: now };
            onScanRef.current(text);
          }
        }
      } catch {
        /* A single failed frame is not worth surfacing — the next one retries. */
      } finally {
        busy = false;
      }
    };

    const id = window.setInterval(tick, 350);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [state]);

  // Release the camera on unmount, or the indicator light stays on.
  useEffect(() => stop, [stop]);

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-void">
        <video
          ref={videoRef}
          playsInline
          muted
          className="aspect-[4/3] w-full object-cover"
          style={{ display: state === "running" ? "block" : "none" }}
        />

        {state === "running" && (
          <>
            {/* Reticle — corner brackets rather than a full frame, so the
                marshal can still see the ticket they are aiming at. */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative size-[58%]">
                {[
                  "left-0 top-0 border-l-2 border-t-2 rounded-tl-lg",
                  "right-0 top-0 border-r-2 border-t-2 rounded-tr-lg",
                  "left-0 bottom-0 border-b-2 border-l-2 rounded-bl-lg",
                  "right-0 bottom-0 border-b-2 border-r-2 rounded-br-lg",
                ].map((pos) => (
                  <span key={pos} className={`absolute size-8 border-gold/80 ${pos}`} />
                ))}
              </div>
            </div>
            {paused && (
              <div className="absolute inset-0 grid place-items-center bg-void/70">
                <p className="text-[13px] font-medium text-gold">Paused</p>
              </div>
            )}
          </>
        )}

        {state !== "running" && (
          <div className="grid aspect-[4/3] place-items-center p-6 text-center">
            {state === "starting" ? (
              <p className="text-[13px] text-ink-3">Opening the camera…</p>
            ) : state === "denied" ? (
              <div className="space-y-2">
                <p className="text-[13.5px] font-medium text-ink">Camera access blocked</p>
                <p className="text-[12.5px] leading-relaxed text-ink-3">
                  Allow camera access for this site in your browser settings, then start the scanner
                  again. Type ticket ids in below meanwhile.
                </p>
              </div>
            ) : state === "unsupported" ? (
              <div className="space-y-2">
                <p className="text-[13.5px] font-medium text-ink">
                  This browser can't scan QR codes
                </p>
                <p className="text-[12.5px] leading-relaxed text-ink-3">
                  Use Chrome on Android, or Safari 17+ on iOS. Manual entry below works everywhere.
                </p>
              </div>
            ) : state === "error" ? (
              <div className="space-y-2">
                <p className="text-[13.5px] font-medium text-ink">Camera failed to start</p>
                <p className="text-[12.5px] leading-relaxed text-ink-3">{detail}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed text-ink-3">
                  Point the camera at a member's QR ticket to check them in.
                </p>
                <button
                  type="button"
                  onClick={() => void start()}
                  className="btn-3d inline-flex h-10 items-center rounded-xl bg-gold px-4 text-[13px] font-semibold text-[color:var(--color-gold-ink)]"
                >
                  Start the scanner
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {state === "running" && (
        <button
          type="button"
          onClick={() => {
            stop();
            setState("idle");
          }}
          className="mt-2 w-full text-center text-[12px] text-ink-3 transition-colors hover:text-ink-2"
        >
          Turn the camera off
        </button>
      )}
    </div>
  );
}
