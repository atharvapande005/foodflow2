import crypto from "crypto";

const API_BASE = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "RazorpayError";
    this.status = status;
  }
}

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpayKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID || null;
}

function credentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new RazorpayError(
      "Online payments are not configured on this server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      503
    );
  }
  return { keyId, keySecret };
}

async function request<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>
): Promise<T> {
  const { keyId, keySecret } = credentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const providerError =
      data && typeof data === "object" && "error" in data
        ? (data as { error?: { description?: string } }).error?.description
        : undefined;
    throw new RazorpayError(providerError || `Razorpay request failed (${response.status}).`, response.status);
  }

  return data as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
  notes?: Record<string, string>;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
  method?: string;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

export function createRazorpayOrder(input: {
  amount: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  return request<RazorpayOrder>("/orders", "POST", {
    amount: Math.round(input.amount * 100),
    currency: "INR",
    receipt: input.receipt,
    notes: input.notes,
    payment_capture: 1,
  });
}

export function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder> {
  return request<RazorpayOrder>(`/orders/${encodeURIComponent(orderId)}`);
}

export function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  return request<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export function captureRazorpayPayment(paymentId: string, amount: number): Promise<RazorpayPayment> {
  return request<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}/capture`, "POST", {
    amount: Math.round(amount * 100),
    currency: "INR",
  });
}

export function refundRazorpayPayment(paymentId: string, amount: number): Promise<RazorpayRefund> {
  return request<RazorpayRefund>(`/payments/${encodeURIComponent(paymentId)}/refund`, "POST", {
    amount: Math.round(amount * 100),
    speed: "normal",
  });
}

export function verifyPaymentSignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = credentials();
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");
  const received = input.signature || "";
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function verifyWebhookSignature(rawBody: Buffer | string, signature?: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
