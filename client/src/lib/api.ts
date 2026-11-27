import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("foodflow_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Do not redirect on a failed login attempt.
    const url = String(error.config?.url || "");
    if (error.response?.status === 401 && !url.includes("/auth/login") && !url.includes("/auth/register")) {
      localStorage.removeItem("foodflow_token");
      localStorage.removeItem("foodflow_session");
      if (!window.location.pathname.startsWith("/auth")) window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: string;
  /** Present when a user is embedded through a Mongoose populate(). */
  _id?: string;
  name: string;
  email: string;
  role: string;
  accountType?: "STUDENT" | "EMPLOYEE";
  studentId?: string;
  employeeId?: string;
  walletBalance: number;
  phone?: string;
  avatar?: string;
  isActive?: boolean;
  createdAt?: string;
  canteenCount?: number;
}

export interface CanteenBranding {
  logoUrl?: string | null;
  backgroundUrl?: string | null;
  backgroundOpacity: number;
  backgroundPosition: string;
  backgroundSize: string;
  overlayColor: string;
  overlayOpacity: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  buttonColor: string;
  logoScale: number;
}

export interface CanteenInstitution {
  collegeName: string;
  organizationName: string;
  logoUrl?: string | null;
  location: string;
  campus: string;
  building: string;
  department: string;
}

export interface CanteenContact {
  phone: string;
  email: string;
  alternatePhone: string;
  address: string;
}

export interface CanteenSettings {
  acceptingOrders: boolean;
  openingTime: string;
  closingTime: string;
  operatingDays: string[];
  preparationTime: number;
  preOpeningMinutes: number;
  minOrderAmount: number;
  contactVisible: boolean;
  dailySummaryHours: number;
}

export interface Canteen {
  _id: string;
  ownerId?: User | string | null;
  name: string;
  code: string;
  description: string;
  category: string;
  tagline: string;
  announcement: string;
  institution: CanteenInstitution;
  contact: CanteenContact;
  branding: CanteenBranding;
  settings: CanteenSettings;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  _id: string;
  canteen?: string | null;
  name: string;
  description: string;
  category: string;
  price: number;
  emoji: string;
  image?: string;
  available: boolean;
  popular: boolean;
  preparationTime: number;
  defaultStock?: number | null;
  stock?: number | null;
  lowStockThreshold?: number;
}

export interface OrderItem {
  menuItem: string;
  name: string;
  price: number;
  quantity: number;
}

export type OrderStatus = "PLACED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export type PaymentMethod = "WALLET" | "CASH" | "ONLINE";
export type PaymentStatus = "PENDING" | "PAID" | "REFUNDED" | "FAILED";

export interface Order {
  _id: string;
  orderNumber: string;
  canteen?:
    | (Pick<Canteen, "_id" | "name" | "code"> & {
        branding?: Pick<CanteenBranding, "logoUrl">;
        institution?: Pick<CanteenInstitution, "collegeName">;
      })
    | string
    | null;
  user?: { _id: string; name: string; email: string; phone?: string; studentId?: string } | string | null;
  createdBy?: { _id: string; name: string; email: string } | string | null;
  guestName?: string;
  guestPhone?: string;
  /** Snapshot of the student's college ID at order time (admin responses only). */
  studentId?: string | null;
  orderSource?: "STUDENT" | "GUEST" | "COUNTER";
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  token?: number | null;
  session?: string | null;
  notes?: string;
  rejectionReason?: string;
  estimatedReadyTime?: string;
  acceptedAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  paidAt?: string | null;
  refundStatus?: "NONE" | "PENDING" | "PROCESSED" | "FAILED";
  createdAt: string;
}

export interface Transaction {
  _id: string;
  type: "TOPUP" | "ORDER_PAYMENT" | "REFUND" | "ADMIN_ADJUSTMENT";
  amount: number;
  balanceAfter: number;
  description: string;
  referenceId?: string;
  createdAt: string;
}

export interface DashboardStats {
  totalOrders: number;
  todayOrders: number;
  todayRevenue: number;
  revenueDelta: string;
  pendingOrders: number;
  totalUsers: number;
  totalMenuItems: number;
  totalCanteens?: number;
  recentOrders: Order[];
  hourlyOrders: { _id: number; count: number }[];
  statusBreakdown: Record<string, number>;
  scope?: string;
}

export interface OrderSummary {
  total: number;
  pending: number;
  placed: number;
  preparing: number;
  ready: number;
  completed: number;
  cancelled: number;
  revenue: number;
  onlineRevenue?: number;
  cashRevenue?: number;
  walletRevenue?: number;
  recentOrders: Order[];
}

export interface InventorySummary {
  totalItems: number;
  availableItems: number;
  trackedItems: number;
  lowStock: number;
  outOfStock: number;
}

export interface OperatingSession {
  _id: string;
  canteen: string;
  status: "OPEN" | "CLOSED";
  tokenCounter: number;
  openedAt: string;
  closedAt?: string | null;
  notes?: string;
  orders?: number;
  completed?: number;
  cancelled?: number;
  revenue?: number;
}

export interface SessionResponse {
  session: OperatingSession | null;
  ordersCount?: number;
  canteen?: Canteen;
}

export interface RevenueData {
  revenue: { cash: number; online: number; wallet: number; total: number };
  byMethod: Record<string, { total: number; orders: number }>;
  counts: { totalOrders: number; completed: number; cancelled: number; pending: number };
  daily: {
    date: string;
    total: number;
    orders: number;
    cash: number;
    online: number;
    wallet: number;
  }[];
  sessions: {
    sessionId: string | null;
    total: number;
    orders: number;
    cash: number;
    online: number;
    wallet: number;
  }[];
  topItems: { name: string; quantity: number; revenue: number }[];
}

export interface PublicCanteen {
  _id: string;
  name: string;
  code: string;
  description: string;
  tagline: string;
  announcement: string;
  institution: CanteenInstitution;
  contact: CanteenContact;
  branding: CanteenBranding;
  settings: Pick<
    CanteenSettings,
    "acceptingOrders" | "openingTime" | "closingTime" | "preparationTime" | "minOrderAmount"
  >;
  isActive: boolean;
}

export interface PublicOrder {
  id: string;
  orderNumber: string;
  token?: number | null;
  tokenLabel?: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
  totalAmount: number;
  guestName?: string;
  guestPhone?: string;
  rejectionReason?: string;
  estimatedReadyTime?: string;
  createdAt: string;
  acceptedAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  canteen?:
    | string
    | {
        _id: string;
        name: string;
        code: string;
        branding?: Pick<CanteenBranding, "logoUrl">;
        institution?: Pick<CanteenInstitution, "collegeName">;
        contact?: Pick<CanteenContact, "phone">;
      }
    | null;
}

export type CanteenInput = Omit<
  Partial<Canteen>,
  "institution" | "contact" | "settings" | "branding"
> & {
  name: string;
  code: string;
  institution?: Partial<CanteenInstitution>;
  contact?: Partial<CanteenContact>;
  settings?: Partial<CanteenSettings>;
  branding?: Partial<CanteenBranding>;
  ownerId?: string | null;
};

export const authAPI = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>("/auth/login", { email, password }),
  register: (data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    accountType?: "STUDENT" | "EMPLOYEE";
    studentId?: string;
    employeeId?: string;
    phone?: string;
  }) => api.post<{ token: string; user: User }>("/auth/register", data),
  registerOwner: (data: { name: string; email: string; password: string; phone?: string }) =>
    api.post<{ token: string; user: User }>("/auth/register/owner", data),
  getProfile: () => api.get<{ user: User }>("/auth/me"),
  updateProfile: (data: {
    name?: string;
    email?: string;
    phone?: string;
    studentId?: string;
    avatar?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }) => api.patch<{ user: User }>("/auth/me", data),
};

export const canteenAPI = {
  list: (params?: { search?: string; college?: string }) =>
    api.get<{ canteens: Canteen[] }>("/canteens", { params }),
  mine: () => api.get<{ canteens: Canteen[] }>("/canteens/mine"),
  get: (id: string) => api.get<{ canteen: Canteen }>(`/canteens/${id}`),
  create: (data: CanteenInput) =>
    api.post<{ canteen: Canteen }>("/canteens", data),
  update: (id: string, data: Partial<CanteenInput>) =>
    api.put<{ canteen: Canteen }>(`/canteens/${id}`, data),
  updateBranding: (id: string, data: Partial<CanteenBranding> | { reset: true }) =>
    api.patch<{ canteen: Canteen; branding: CanteenBranding }>(`/canteens/${id}/branding`, data),
  setActive: (id: string, isActive: boolean) =>
    api.patch<{ canteen: Canteen }>(`/canteens/${id}/status`, { isActive }),
  remove: (id: string) => api.delete(`/canteens/${id}`),
  summary: () => api.get<{ count: number }>("/canteens/summary"),
  getSession: (id: string) => api.get<SessionResponse>(`/canteens/${id}/session`),
  startSession: (id: string) =>
    api.post<{ session: OperatingSession; canteen: Canteen; message: string }>(
      `/canteens/${id}/session/start`
    ),
  closeSession: (id: string) =>
    api.post<{ session: OperatingSession | null; canteen: Canteen; message: string }>(
      `/canteens/${id}/session/close`
    ),
};

export const uploadAPI = {
  image: (
    file: File,
    kind: "logo" | "background" | "avatar" | "menu" | "canteen" | "institution" | "platform" = "canteen"
  ) => {
    const form = new FormData();
    form.append("image", file);
    return api.post<{ url: string; filename: string }>("/uploads/image", form, {
      params: { kind },
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export interface PlatformSettings {
  logoUrl: string | null;
}

export const settingsAPI = {
  get: () => api.get<{ settings: PlatformSettings }>("/settings"),
  update: (data: { logoUrl: string | null }) =>
    api.patch<{ message: string; settings: PlatformSettings }>("/settings", data),
};

export const menuAPI = {
  getAll: (params?: { category?: string; search?: string; canteenId?: string; popular?: boolean }) =>
    api.get<{ items: MenuItem[] }>("/menu", { params }),
  getOne: (id: string) => api.get<{ item: MenuItem }>(`/menu/${id}`),
  create: (data: Partial<MenuItem> & { canteen?: string }) => api.post<{ item: MenuItem }>("/menu", data),
  update: (id: string, data: Partial<MenuItem>) => api.put<{ item: MenuItem }>(`/menu/${id}`, data),
  delete: (id: string) => api.delete(`/menu/${id}`),
  getCategories: (canteenId?: string) =>
    api.get<{ categories: string[]; stored?: { id: string; name: string; sortOrder: number }[] }>(
      "/menu/categories",
      { params: { canteenId } }
    ),
  createCategory: (name: string, canteenId?: string) =>
    api.post<{ category: { _id: string; name: string } }>("/menu/categories", { name, canteenId }),
  renameCategory: (name: string, newName: string, canteenId?: string) =>
    api.patch<{ name: string; updatedItems: number }>(`/menu/categories/${encodeURIComponent(name)}`, {
      name: newName,
      canteenId,
    }),
  deleteCategory: (name: string, canteenId?: string, reassignTo?: string) =>
    api.delete<{ movedItems: number }>(`/menu/categories/${encodeURIComponent(name)}`, {
      data: { canteenId, reassignTo },
    }),
  getInventory: (canteenId?: string) =>
    api.get<{ items: MenuItem[]; summary: InventorySummary }>("/menu/inventory", { params: { canteenId } }),
};

export const orderAPI = {
  create: (data: {
    canteenId?: string;
    items: { menuItem: string; quantity: number }[];
    paymentMethod?: string;
    notes?: string;
  }) => api.post<{ order: Order; walletBalance: number }>("/orders", data),
  getMyOrders: (params?: { canteenId?: string; status?: string; sessionId?: string }) =>
    api.get<{ orders: Order[] }>("/orders/my", { params }),
  getAll: (params?: {
    status?: string;
    search?: string;
    canteenId?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    sessionId?: string;
    from?: string;
    to?: string;
  }) => api.get<{ orders: Order[] }>("/orders", { params }),
  getSummary: (canteenId?: string, sessionId?: string) =>
    api.get<OrderSummary>("/orders/summary", { params: { canteenId, sessionId } }),
  updateStatus: (id: string, status: string, reason?: string) =>
    api.patch<{ order: Order; message: string; warning?: string }>(`/orders/${id}/status`, {
      status,
      reason,
    }),
  getById: (id: string) => api.get<{ order: Order }>(`/orders/${id}`),
};

export const paymentAPI = {
  getConfig: () => api.get<{ configured: boolean; keyId: string | null; currency: string }>("/payments/config"),
  createOnlineOrder: (data: {
    canteenId?: string;
    items: { menuItem: string; quantity: number }[];
    notes?: string;
  }) =>
    api.post<{
      order: { id: string; orderNumber: string; token: number | null; totalAmount: number };
      payment: { keyId: string | null; razorpayOrderId: string; amount: number; currency: string };
    }>("/payments/online/order", data),
  verify: (data: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) => api.post<{ order: Order; message: string; duplicate: boolean }>("/payments/verify", data),
  failed: (orderId: string) =>
    api.post<{ message: string; order: Order }>("/payments/failed", { orderId }),
};

export const cashAPI = {
  list: (params?: { canteenId?: string; date?: string; sessionId?: string }) =>
    api.get<{
      orders: Order[];
      summary: { orders: number; collected: number; pending: number };
    }>("/cash/orders", { params }),
  create: (data: {
    canteenId?: string;
    items: { menuItem: string; quantity: number }[];
    customerName?: string;
    customerPhone?: string;
    notes?: string;
  }) => api.post<{ order: Order; tokenLabel: string | null; message: string }>("/cash/orders", data),
  markPaid: (id: string) =>
    api.patch<{ order: Order; message: string }>(`/cash/orders/${id}/paid`),
};

export const publicAPI = {
  getCanteen: (code: string) =>
    api.get<{
      canteen: PublicCanteen;
      items: MenuItem[];
      session: { _id: string; openedAt: string; lastToken: number } | null;
      acceptingOrders: boolean;
    }>(`/public/canteens/${encodeURIComponent(code)}`),
  getSession: (code: string) =>
    api.get<{ session: OperatingSession | null }>(`/public/canteens/${encodeURIComponent(code)}/session`),
  createOrder: (data: {
    canteenCode?: string;
    canteenId?: string;
    items: { menuItem: string; quantity: number }[];
    guestName: string;
    guestPhone?: string;
    notes?: string;
  }) =>
    api.post<{ order: PublicOrder; canteen: { _id: string; name: string; code: string }; message: string }>(
      "/public/orders",
      data
    ),
  trackOrder: (id: string, phone?: string) =>
    api.get<{ order: PublicOrder }>(`/public/orders/${id}`, { params: { phone } }),
};

export const revenueAPI = {
  get: (params?: { canteenId?: string; sessionId?: string; from?: string; to?: string }) =>
    api.get<RevenueData>("/revenue", { params }),
  sessions: (canteenId?: string) =>
    api.get<{ sessions: OperatingSession[] }>("/revenue/sessions", { params: { canteenId } }),
  canteens: (params?: { from?: string; to?: string }) =>
    api.get<{
      canteens: {
        canteenId: string;
        name: string;
        code: string;
        total: number;
        orders: number;
        cash: number;
        online: number;
        wallet: number;
      }[];
    }>("/revenue/canteens", { params }),
};

export const walletAPI = {
  getBalance: () => api.get<{ walletBalance: number }>("/wallet/balance"),
  createTopupOrder: (amount: number) =>
    api.post<{
      topupId: string;
      payment: { keyId: string | null; razorpayOrderId: string; amount: number; currency: string };
    }>("/wallet/topup/order", { amount }),
  verifyTopup: (data: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    api.post<{ message: string; duplicate: boolean; walletBalance?: number }>("/wallet/topup/verify", data),
  getTransactions: () => api.get<{ transactions: Transaction[] }>("/wallet/transactions"),
};

export const analyticsAPI = {
  getDashboard: (canteenId?: string) =>
    api.get<DashboardStats>("/analytics/dashboard", { params: { canteenId } }),
  getSales: (days?: number, canteenId?: string) =>
    api.get("/analytics/sales", { params: { days, canteenId } }),
  getUserStats: () => api.get("/analytics/users"),
};

export const userAPI = {
  getAll: (params?: { role?: string; search?: string }) =>
    api.get<{ users: User[] }>("/users", { params }),
  getOwners: () => api.get<{ owners: User[] }>("/users/owners"),
  update: (id: string, data: { role?: string; isActive?: boolean }) =>
    api.put<{ user: User }>(`/users/${id}`, data),
  toggleActive: (id: string) =>
    api.patch<{ user: User }>(`/users/${id}/toggle-active`),
};

export default api;
