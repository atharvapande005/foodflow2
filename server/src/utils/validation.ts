import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");
const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a valid hex colour");
const optionalUrl = z.string().max(2048).nullable().optional();

const phoneNumber = z
  .string()
  .trim()
  .regex(/^[+]?[0-9][0-9\s-]{8,14}$/, "Enter a valid phone number");

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  // Public registration can never create an administrator or canteen owner.
  role: z.enum(["STUDENT", "FACULTY", "STAFF"]).optional(),
  accountType: z.enum(["STUDENT", "EMPLOYEE"]).optional(),
  studentId: z.string().max(40).optional(),
  employeeId: z.string().max(40).optional(),
  phone: z.string().max(30).optional(),
});

export const ownerRegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().max(30).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  studentId: z.string().max(40).optional(),
  avatar: optionalUrl,
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).optional(),
});

export const menuItemSchema = z.object({
  canteen: objectId.optional().nullable(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  price: z.number().min(0, "Price must be positive"),
  emoji: z.string().optional(),
  image: z.string().max(2048).optional(),
  available: z.boolean().optional(),
  popular: z.boolean().optional(),
  preparationTime: z.number().min(1).optional(),
  defaultStock: z.number().min(0).nullable().optional(),
  stock: z.number().min(0).nullable().optional(),
  lowStockThreshold: z.number().min(0).optional(),
});

export const orderItemSchema = z.object({
  menuItem: z.string(),
  quantity: z.number().min(1).max(50),
});

export const orderSchema = z.object({
  canteenId: objectId.optional(),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  paymentMethod: z.enum(["WALLET", "CASH", "ONLINE"]).optional(),
  notes: z.string().max(500).optional(),
});

export const cashOrderSchema = z.object({
  canteenId: objectId.optional(),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  customerName: z.string().max(80).optional(),
  customerPhone: z.string().max(30).optional(),
  notes: z.string().max(500).optional(),
});

export const publicOrderSchema = z.object({
  canteenId: objectId.optional(),
  canteenCode: z.string().max(24).optional(),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  guestName: z.string().min(1, "Your name is required").max(80),
  guestPhone: phoneNumber,
  notes: z.string().max(500).optional(),
});

export const onlineOrderSchema = z.object({
  canteenId: objectId.optional(),
  canteenCode: z.string().max(24).optional(),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  notes: z.string().max(500).optional(),
  guestName: z.string().max(80).optional(),
  guestPhone: z.string().max(30).optional(),
});

export const verifyPaymentSchema = z.object({
  orderId: objectId,
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const createWalletTopupSchema = z.object({
  amount: z
    .number()
    .finite()
    .min(10, "Minimum recharge is ₹10")
    .max(10000, "Maximum recharge is ₹10,000"),
});

export const verifyWalletTopupSchema = z.object({
  razorpayOrderId: z
    .string()
    .trim()
    .min(1, "Razorpay order ID is required")
    .max(100)
    .startsWith("order_", "Invalid Razorpay order ID"),
  razorpayPaymentId: z
    .string()
    .trim()
    .min(1, "Razorpay payment ID is required")
    .max(100)
    .startsWith("pay_", "Invalid Razorpay payment ID"),
  razorpaySignature: z
    .string()
    .trim()
    .min(1, "Razorpay signature is required")
    .max(200),
});

export const topupSchema = z.object({
  amount: z.number().min(10, "Minimum top-up is ₹10").max(10000, "Maximum top-up is ₹10,000"),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["PLACED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]),
  reason: z.string().max(300).optional(),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(["STUDENT", "FACULTY", "STAFF", "ADMIN", "CANTEEN_OPERATOR"]),
  isActive: z.boolean().optional(),
});

export const canteenBrandingSchema = z.object({
  logoUrl: optionalUrl,
  backgroundUrl: optionalUrl,
  backgroundOpacity: z.number().min(0).max(1).optional(),
  backgroundPosition: z
    .enum(["center", "top", "bottom", "left", "right", "center top", "center bottom"])
    .optional(),
  backgroundSize: z.enum(["cover", "contain", "auto"]).optional(),
  overlayColor: hexColor.optional(),
  overlayOpacity: z.number().min(0).max(1).optional(),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),
  buttonColor: hexColor.optional(),
  logoScale: z.number().min(0.5).max(2).optional(),
});

export const canteenSettingsSchema = z.object({
  acceptingOrders: z.boolean().optional(),
  openingTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM").optional(),
  closingTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM").optional(),
  operatingDays: z.array(z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])).optional(),
  preparationTime: z.number().min(1).max(240).optional(),
  preOpeningMinutes: z.number().min(0).max(240).optional(),
  minOrderAmount: z.number().min(0).optional(),
  contactVisible: z.boolean().optional(),
  dailySummaryHours: z.number().min(1).max(72).optional(),
});

export const canteenInstitutionSchema = z.object({
  collegeName: z.string().max(160).optional(),
  organizationName: z.string().max(160).optional(),
  logoUrl: optionalUrl,
  location: z.string().max(160).optional(),
  campus: z.string().max(160).optional(),
  building: z.string().max(160).optional(),
  department: z.string().max(160).optional(),
});

export const canteenContactSchema = z.object({
  phone: z.string().max(30).optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  alternatePhone: z.string().max(30).optional(),
  address: z.string().max(400).optional(),
});

export const canteenCreateSchema = z.object({
  name: z.string().min(2, "Canteen name is required").max(90),
  code: z
    .string()
    .min(2, "Canteen code is required")
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphens or underscores"),
  description: z.string().max(1200).optional(),
  category: z.string().max(60).optional(),
  tagline: z.string().max(140).optional(),
  announcement: z.string().max(300).optional(),
  institution: canteenInstitutionSchema.optional(),
  contact: canteenContactSchema.optional(),
  branding: canteenBrandingSchema.optional(),
  settings: canteenSettingsSchema.optional(),
  isActive: z.boolean().optional(),
  ownerId: objectId.nullable().optional(),
});

export const canteenUpdateSchema = canteenCreateSchema.partial().extend({
  code: canteenCreateSchema.shape.code.optional(),
});

export const categoryCreateSchema = z.object({
  canteenId: objectId.optional(),
  name: z.string().min(1, "Category name is required").max(60),
});

export const categoryRenameSchema = z.object({
  canteenId: objectId.optional(),
  name: z.string().min(1, "Category name is required").max(60),
});

export const categoryDeleteSchema = z.object({
  canteenId: objectId.optional(),
  reassignTo: z.string().max(60).optional(),
});

export const sessionNotesSchema = z.object({
  notes: z.string().max(400).optional(),
});

export const platformSettingsSchema = z.object({
  logoUrl: optionalUrl,
});

export const uploadKindSchema = z.enum([
  "logo",
  "background",
  "avatar",
  "menu",
  "canteen",
  "institution",
  "platform",
]);