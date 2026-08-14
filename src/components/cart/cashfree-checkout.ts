/**
 * Cashfree JS SDK v3 loader.
 *
 * The SDK resolves when checkout closes, but its result is never trusted for
 * whether money moved — the caller always asks our server, which asks Cashfree.
 * This only decides *when* to go and check.
 */

export type CashfreeMode = "sandbox" | "production";

type CheckoutOptions = {
  paymentSessionId: string;
  redirectTarget?: string;
};

type CheckoutResult = {
  error?: { message?: string };
  paymentDetails?: { paymentMessage?: string };
  redirect?: boolean;
};

type CashfreeInstance = {
  checkout: (options: CheckoutOptions) => Promise<CheckoutResult>;
};

type CashfreeFactory = (config: { mode: CashfreeMode }) => CashfreeInstance;

declare global {
  interface Window {
    Cashfree?: CashfreeFactory;
  }
}

const SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";

/** Loads the SDK on demand and returns an initialised instance (or null). */
export function loadCashfree(
  mode: CashfreeMode,
): Promise<CashfreeInstance | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);

    const init = () => {
      try {
        resolve(window.Cashfree ? window.Cashfree({ mode }) : null);
      } catch {
        resolve(null);
      }
    };

    if (window.Cashfree) return init();

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SDK_URL}"]`,
    );
    if (existing) {
      existing.addEventListener("load", init, { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = init;
    script.onerror = () => resolve(null);
    document.body.appendChild(script);
  });
}
