/**
 * Razorpay Checkout integration.
 *
 * Checkout is an overlay served from Razorpay's CDN, not a page redirect — the
 * script is loaded on demand and opened over the app, and the browser stays on
 * our origin the whole time.
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** The backend substitutes these when RAZORPAY_KEY_ID is still the placeholder. */
const MOCK_KEY = "mock_key_id";
const MOCK_ORDER_PREFIX = "order_mock_";

export interface CheckoutResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** True when the backend is running without real Razorpay credentials. */
export function isMockPayment(keyId?: string | null, orderId?: string | null) {
  return (
    !keyId ||
    keyId === MOCK_KEY ||
    (typeof orderId === "string" && orderId.startsWith(MOCK_ORDER_PREFIX))
  );
}

/**
 * Publishable key, used to resume payment for an already-created order (the
 * register response only carries it at creation time). Key ids are public —
 * the secret never leaves the backend.
 */
export function publishableKey(): string | null {
  return import.meta.env.VITE_RAZORPAY_KEY_ID?.trim() || null;
}

let loader: Promise<boolean> | null = null;

/** Injects checkout.js once; resolves false if it cannot be fetched (offline). */
export function loadCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ("Razorpay" in window) return Promise.resolve(true);
  if (loader) return loader;

  loader = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      loader = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });

  return loader;
}

export class CheckoutDismissed extends Error {
  constructor() {
    super("Payment window was closed before the payment completed.");
    this.name = "CheckoutDismissed";
  }
}

export class CheckoutUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutUnavailable";
  }
}

interface OpenOptions {
  keyId: string;
  orderId: string;
  /** In paise — the smallest currency unit, which is what Razorpay expects. */
  amountPaise: number;
  eventTitle: string;
  userName: string;
  userEmail: string;
  contact?: string | null;
}

/**
 * Opens Checkout and resolves with the fields the backend needs to verify.
 * Rejects with CheckoutDismissed if the member closes the overlay, or
 * CheckoutUnavailable if the script or credentials are missing.
 */
export function openCheckout(opts: OpenOptions): Promise<CheckoutResult> {
  return new Promise(async (resolve, reject) => {
    const ready = await loadCheckout();
    if (!ready) {
      reject(
        new CheckoutUnavailable(
          "Could not reach Razorpay Checkout. Check your connection and try again.",
        ),
      );
      return;
    }

    const Razorpay = (window as unknown as { Razorpay?: new (o: unknown) => { open: () => void; on: (e: string, cb: (p: unknown) => void) => void } }).Razorpay;
    if (!Razorpay) {
      reject(new CheckoutUnavailable("Razorpay Checkout failed to initialise."));
      return;
    }

    let settled = false;

    const instance = new Razorpay({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amountPaise,
      currency: "INR",
      name: "Burn and Bond Run Club",
      description: opts.eventTitle,
      prefill: {
        name: opts.userName,
        email: opts.userEmail,
        contact: opts.contact ?? undefined,
      },
      notes: { event: opts.eventTitle },
      theme: { color: "#e9b949" },
      handler: (response: unknown) => {
        settled = true;
        const r = response as Partial<CheckoutResult>;
        if (!r.razorpay_payment_id || !r.razorpay_signature) {
          reject(new CheckoutUnavailable("Razorpay returned an incomplete response."));
          return;
        }
        resolve({
          razorpay_order_id: r.razorpay_order_id ?? opts.orderId,
          razorpay_payment_id: r.razorpay_payment_id,
          razorpay_signature: r.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => {
          if (!settled) reject(new CheckoutDismissed());
        },
      },
    });

    instance.on("payment.failed", (payload: unknown) => {
      settled = true;
      const description =
        (payload as { error?: { description?: string } })?.error?.description ??
        "The payment was declined.";
      reject(new CheckoutUnavailable(description));
    });

    instance.open();
  });
}
