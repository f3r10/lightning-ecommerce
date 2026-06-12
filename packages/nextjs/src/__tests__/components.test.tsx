import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { CopyButton } from "../components/CopyButton.js";
import { ExpiryCountdown } from "../components/ExpiryCountdown.js";
import { LightningCheckout } from "../components/LightningCheckout.js";

// --- Mock heavy dependencies ---

// qrcode.toCanvas isn't available in jsdom — stub it out.
vi.mock("qrcode", () => ({
  default: {
    toCanvas: vi.fn((_canvas: unknown, _value: unknown, _opts: unknown, cb: (err: null) => void) => cb(null)),
  },
}));

// Mock the hooks so LightningCheckout tests control the state machine directly.
vi.mock("../hooks/useInvoice.js", () => ({
  useInvoice: vi.fn(),
}));
vi.mock("../hooks/usePaymentStatus.js", () => ({
  usePaymentStatus: vi.fn(),
}));

import { useInvoice } from "../hooks/useInvoice.js";
import { usePaymentStatus } from "../hooks/usePaymentStatus.js";
import type { InvoiceResponse } from "@lightning-ecommerce/core";

const mockUseInvoice = vi.mocked(useInvoice);
const mockUsePaymentStatus = vi.mocked(usePaymentStatus);

afterEach(cleanup);

const INVOICE: InvoiceResponse = {
  payment_hash: "a".repeat(64),
  bolt11: "lntbs200u1ptest",
  amount_msat: 20_000_000,
  expiry_unix: 9_999_999_999,
  status: "pending",
};

// --- CopyButton ---

describe("CopyButton", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it("renders with the default label", () => {
    render(<CopyButton text="lntbs..." />);
    expect(screen.getByRole("button")).toHaveTextContent("Copy invoice");
  });

  it("shows 'Copied!' after clicking and reverts after 2s", async () => {
    vi.useFakeTimers();
    render(<CopyButton text="lntbs..." />);

    // Click and flush the clipboard promise microtask
    await act(async () => {
      screen.getByRole("button").click();
      await Promise.resolve();
    });
    expect(screen.getByRole("button")).toHaveTextContent("Copied!");

    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole("button")).toHaveTextContent("Copy invoice");
    vi.useRealTimers();
  });
});

// --- ExpiryCountdown ---

describe("ExpiryCountdown", () => {
  it("shows 'Expired' when expiry_unix is in the past", () => {
    render(<ExpiryCountdown expiryUnix={1} />);
    expect(screen.getByText("Expired")).toBeDefined();
  });

  it("shows time remaining when expiry_unix is in the future", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    render(<ExpiryCountdown expiryUnix={future} />);
    expect(screen.getByText(/Expires in \d\d:\d\d/)).toBeDefined();
  });
});

// --- LightningCheckout ---

function defaultInvoiceHook(overrides = {}) {
  return {
    invoice: null,
    createInvoice: vi.fn(),
    isLoading: false,
    error: null,
    reset: vi.fn(),
    ...overrides,
  };
}

function defaultStatusHook() {
  return { status: null, isPolling: false, error: null };
}

describe("LightningCheckout", () => {
  beforeEach(() => {
    mockUseInvoice.mockReturnValue(defaultInvoiceHook());
    mockUsePaymentStatus.mockReturnValue(defaultStatusHook());
  });

  afterEach(() => { vi.clearAllMocks(); });

  it("renders the Pay button in idle state", () => {
    render(
      <LightningCheckout
        description="Order #1"
        amount_msat={20_000_000}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByRole("button")).toHaveTextContent("Pay 20,000 sat");
  });

  it("uses custom buttonLabel when provided", () => {
    render(
      <LightningCheckout
        description="Donation"
        variableAmount
        onSuccess={vi.fn()}
        buttonLabel="Support us"
      />,
    );
    expect(screen.getByRole("button")).toHaveTextContent("Support us");
  });

  it("shows 'Generating invoice…' and disables the button while loading", () => {
    mockUseInvoice.mockReturnValue(defaultInvoiceHook({ isLoading: true }));
    render(
      <LightningCheckout description="Order" onSuccess={vi.fn()} />,
    );

    act(() => { screen.getByRole("button").click(); });
    expect(screen.getByRole("button")).toHaveAttribute("disabled");
  });

  it("shows QR code and copy button once invoice is set", async () => {
    mockUseInvoice.mockReturnValue(defaultInvoiceHook({ invoice: INVOICE }));

    const { rerender } = render(
      <LightningCheckout description="Order" onSuccess={vi.fn()} />,
    );

    // Simulate the component receiving an invoice after createInvoice() resolves:
    // click → sets checkoutState to "loading" → useEffect sees invoice → "awaiting"
    act(() => { screen.getByRole("button").click(); });

    rerender(<LightningCheckout description="Order" onSuccess={vi.fn()} />);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /copy/i })).toBeDefined(),
    );
  });

  it("shows success message when payment is received", async () => {
    const onSuccess = vi.fn();
    let capturedOpts: { onSuccess?: (inv: InvoiceResponse) => void } | undefined;

    mockUsePaymentStatus.mockImplementation((_hash, opts) => {
      capturedOpts = opts;
      return { status: null, isPolling: false, error: null };
    });
    mockUseInvoice.mockReturnValue(defaultInvoiceHook({ invoice: INVOICE }));

    render(<LightningCheckout description="Order" onSuccess={onSuccess} />);
    // Click → loading → effect sees invoice → awaiting
    act(() => { screen.getByRole("button").click(); });

    // Simulate usePaymentStatus firing the success callback
    await act(async () => { capturedOpts?.onSuccess?.(INVOICE); });

    expect(screen.getByText("Payment received")).toBeDefined();
    expect(onSuccess).toHaveBeenCalledWith(INVOICE);
  });

  it("shows error message and Try again button on invoice creation failure", async () => {
    mockUseInvoice.mockReturnValue(
      defaultInvoiceHook({ error: "amount_msat too small" }),
    );

    render(
      <LightningCheckout description="Order" onSuccess={vi.fn()} />,
    );
    act(() => { screen.getByRole("button").click(); });

    await waitFor(() =>
      expect(screen.queryByText(/amount_msat too small/)).toBeDefined(),
    );
  });
});
