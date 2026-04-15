export type ProductCheckoutItemInput = {
  id: string;
  quantity: number;
};

export type ProductCheckoutRequest = {
  items: ProductCheckoutItemInput[];
};

export type ProductCheckoutLineItem = {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ProductCheckoutStatus = "pending" | "completed" | "canceled" | "failed";

export type ProductCheckoutPayment = {
  provider: "stripe";
  status: "ready";
  sessionId: string;
  checkoutUrl: string;
};

export type ProductCheckoutResponse = {
  checkoutId: string;
  sellerHandle: string;
  sellerUserId: string;
  currency: string;
  totalAmount: number;
  preparedAt: string;
  items: ProductCheckoutLineItem[];
  payment: ProductCheckoutPayment;
};
