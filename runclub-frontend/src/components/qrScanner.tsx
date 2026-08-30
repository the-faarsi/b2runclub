import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/format";

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

/** Reads one frame and returns the QR text, or null. */
type Decode = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => Promise<string | null>;

/**
 * Picks a decoder for this browser.
 *
 * BarcodeDetector is Chromium-only. Safari does not ship it, which meant an
 * iPhone — the device an organiser actually has at a start line — reported
 * "unsupported" and never opened the camera at all. jsQR is loaded dynamically
 * in that case only, so Android and desktop Chrome still pay nothing for it.
 */
async function makeDecoder(): Promise<Decode> {
    const Ctor = getDetectorCtor();
    if (Ctor) {
        const detector = new Ctor({ formats: ["qr_code"] });
        return async (canvas) => {
            const codes = await detector.detect(canvas);
            return codes[0]?.rawValue ?? null;
        };
    }

    const { default: jsQR } = await import("jsqr");
    return async (canvas, ctx) => {
        const { width, height } = canvas;
        if (!width || !height) return null;
        const image = ctx.getImageData(0, 0, width, height);
        // "attemptBoth" costs a second pass but catches a ticket held at an
        // angle or on a dark phone screen, which is most of them in practice.
        const found = jsQR(image.data, width, height, { inversionAttempts: "attemptBoth" });
        return found?.data ?? null;
    };
}

/**
 * True when this browser can scan at all — which now means only "is there a
 * camera API", since a decoder is always available via the jsQR fallback.
 *
 * Note getUserMedia requires a secure context: HTTPS, or localhost. On a plain
 * http:// origin over the network this is false, and no camera will open.
 */
export function scannerSupported(): boolean {
    return Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Camera permission needs HTTPS. Worth telling the user apart from a refusal. */
export function insecureContext(): boolean {
    return typeof window !== "undefined" && !window.isSecureContext;
}

export type ScannerState =
    | "idle"
    | "starting"
    | "running"
    | "denied"
    | "unsupported"
    | "insecure"
    | "nocamera"
    | "error";

/**
 * Camera QR scanner.
 *
 * Uses the platform BarcodeDetector where it exists (Chromium) and falls back to
 * jsQR everywhere else — which is what makes this work on an iPhone. The earlier
 * version assumed Safari shipped BarcodeDetector; it does not, so iOS reported
 * "unsupported" and never opened the camera, leaving the scanner usable only on
 * a laptop. jsQR is imported dynamically on the first frame, so browsers with
 * the native detector never download it.
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
  /** Which camera to open. A ref so flipping does not re-run `start`'s deps. */
  const facingRef = useRef<"environment" | "user">("environment");

  const [state, setState] = useState<ScannerState>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

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

  const start = useCallback(
    async (facing: "environment" | "user" = facingRef.current) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        return;
      }
      if (insecureContext()) {
        setState("insecure");
        return;
      }

      stop();
      setState("starting");
      facingRef.current = facing;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // Rear camera on a phone; falls back to whatever exists on a laptop.
          // `ideal` rather than `exact` so a laptop with only a front camera
          // still opens instead of throwing OverconstrainedError.
          video: {
            facingMode: { ideal: facing },
            // Asking for a decent resolution matters: a 320px stream cannot
            // resolve a QR code held at arm's length.
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
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

        // Torch is a capability of the active track, not the browser, and only
        // the rear camera has one. Checked after the stream opens.
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorchAvailable(Boolean(caps.torch));
        setTorchOn(false);

        setState("running");
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name === "NotAllowedError" || name === "SecurityError") {
          setState("denied");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setState("nocamera");
        } else {
          setState("error");
          setDetail(err instanceof Error ? err.message : "Could not open the camera");
        }
        stop();
      }
    },
    [stop],
  );

  /** Flip between rear and front. Reopens the stream — a track cannot switch. */
  const flipCamera = useCallback(() => {
    void start(facingRef.current === "environment" ? "user" : "environment");
  }, [start]);

  /** Torch is applied to the live track, so it survives without a restart. */
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await (track as MediaStreamTrack & {
        applyConstraints(c: { advanced?: { torch?: boolean }[] }): Promise<void>;
      }).applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // Some devices advertise torch and then refuse it. Hide the control
      // rather than leaving a button that does nothing.
      setTorchAvailable(false);
    }
  }, [torchOn]);

  // Decode loop. Only mounted while the camera is actually running.
  useEffect(() => {
    if (state !== "running") return;

    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    let cancelled = false;
    let busy = false;
    let decode: Decode | null = null;

    const tick = async () => {
      if (cancelled || busy || pausedRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !ctx) return;

      busy = true;
      try {
        // Built on first tick, so the jsQR chunk is only fetched once the
        // camera is actually live rather than on page load.
        if (!decode) decode = await makeDecoder();
        if (cancelled) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const text = await decode(canvas, ctx);

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
          className="aspect-[3/4] w-full object-cover sm:aspect-[4/3]"
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

            {/* Camera controls, over the preview. Thumb-sized (44px) and along
                the bottom edge, which is where a hand holding a phone is. */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-void/85 to-transparent p-3">
              {torchAvailable && (
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  aria-pressed={torchOn}
                  className={cn(
                    "grid size-11 place-items-center rounded-full border backdrop-blur-sm transition-colors",
                    torchOn
                      ? "border-gold bg-gold text-[color:var(--color-gold-ink)]"
                      : "border-white/20 bg-void/60 text-ink-2",
                  )}
                  aria-label={torchOn ? "Turn the torch off" : "Turn the torch on"}
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
                    <path
                      d="M9 2h6l-1 7h4l-8 13 2-9H8z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={flipCamera}
                className="grid size-11 place-items-center rounded-full border border-white/20 bg-void/60 text-ink-2 backdrop-blur-sm transition-colors hover:text-ink"
                aria-label="Switch camera"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
                  <path
                    d="M4 7h3l2-2h6l2 2h3v12H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  stop();
                  setState("idle");
                }}
                className="h-11 rounded-full border border-white/20 bg-void/60 px-4 text-[13px] font-semibold text-ink-2 backdrop-blur-sm transition-colors hover:text-ink"
              >
                Stop
              </button>
            </div>
          </>
        )}

        {state !== "running" && (
          <div className="grid aspect-[3/4] place-items-center p-6 text-center sm:aspect-[4/3]">
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
                  This browser has no camera API
                </p>
                <p className="text-[12.5px] leading-relaxed text-ink-3">
                  Manual entry below works everywhere.
                </p>
              </div>
            ) : state === "insecure" ? (
              <div className="space-y-2">
                <p className="text-[13.5px] font-medium text-ink">Camera needs a secure page</p>
                <p className="text-[12.5px] leading-relaxed text-ink-3">
                  Browsers only allow the camera over HTTPS. Open the site on its https:// address
                  — reaching it by IP over the local network won't work.
                </p>
              </div>
            ) : state === "nocamera" ? (
              <div className="space-y-2">
                <p className="text-[13.5px] font-medium text-ink">No camera found</p>
                <p className="text-[12.5px] leading-relaxed text-ink-3">
                  This device has no camera the browser can reach. Use manual entry below.
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

    </div>
  );
}
