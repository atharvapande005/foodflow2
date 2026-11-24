import { MenuItem } from "./models/MenuItem.js";
import { Order } from "./models/Order.js";
import { User } from "./models/User.js";
import { Canteen, DEFAULT_BRANDING, DEFAULT_SETTINGS } from "./models/Canteen.js";
import { MenuCategory } from "./models/MenuCategory.js";
import bcrypt from "bcryptjs";

/**
 * The specified college is only used as the initial default for a brand-new
 * database. Every canteen owner and administrator can edit it afterwards.
 */
const DEFAULT_COLLEGE = "Shri Sant Gajanan Maharaj College of Engineering, Shegaon";

const DEFAULT_MENU = [
  { name: "Masala Maggi", description: "Classic instant noodles with masala spice", category: "Quick Bites", price: 45, emoji: "🍜", popular: true, available: true, preparationTime: 8, defaultStock: 60 },
  { name: "Veg Sandwich", description: "Fresh vegetables with mint chutney", category: "Snacks", price: 55, emoji: "🥪", popular: true, available: true, preparationTime: 5, defaultStock: 40 },
  { name: "Samosa", description: "Crispy pastry with spiced potato filling", category: "Snacks", price: 20, emoji: "🥟", popular: false, available: true, preparationTime: 3, defaultStock: 100 },
  { name: "Masala Chai", description: "Hot spiced milk tea", category: "Beverages", price: 15, emoji: "☕", popular: true, available: true, preparationTime: 5, defaultStock: 150 },
  { name: "Cold Coffee", description: "Iced coffee with cream", category: "Beverages", price: 50, emoji: "🥤", popular: true, available: true, preparationTime: 5, defaultStock: 40 },
  { name: "Veg Thali", description: "Complete meal with dal, rice, roti, sabzi & salad", category: "Meals", price: 90, emoji: "🍛", popular: true, available: true, preparationTime: 15, defaultStock: 50 },
  { name: "Paneer Tikka", description: "Grilled cottage cheese with spices", category: "Meals", price: 120, emoji: "🍢", popular: false, available: true, preparationTime: 20, defaultStock: 25 },
  { name: "Egg Bhurji", description: "Spiced scrambled eggs with toast", category: "Meals", price: 65, emoji: "🍳", popular: false, available: true, preparationTime: 10, defaultStock: 30 },
  { name: "Fresh Lime Soda", description: "Refreshing lime with soda", category: "Beverages", price: 25, emoji: "🍋", popular: false, available: true, preparationTime: 3, defaultStock: 80 },
  { name: "Bread Pakora", description: "Bread stuffed with potato, deep fried", category: "Snacks", price: 30, emoji: "🍞", popular: false, available: true, preparationTime: 8, defaultStock: 50 },
  { name: "Pav Bhaji", description: "Spiced mashed vegetables with buttered buns", category: "Meals", price: 70, emoji: "🍲", popular: true, available: true, preparationTime: 12, defaultStock: 40 },
  { name: "Chocolate Shake", description: "Rich chocolate milkshake", category: "Beverages", price: 60, emoji: "🍫", popular: false, available: true, preparationTime: 5, defaultStock: 35 },
];

async function ensureAdmin(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@foodflow.app";
  const existingAdmin = await User.findOne({ role: "ADMIN" });
  if (existingAdmin) return;

  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@12345";
  if (process.env.ADMIN_PASSWORD) {
    console.warn("[Seed] Admin password read from env - change it after first login.");
  } else {
    console.warn("[Seed] No ADMIN_PASSWORD set, created admin with default password. Set ADMIN_PASSWORD in .env.");
  }
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await User.create({
    name: "System Administrator",
    email: adminEmail,
    passwordHash,
    role: "ADMIN",
    walletBalance: 0,
  });
  console.log(`[Seed] Created administrator account: ${adminEmail}`);
}

async function ensureDemoOwner(): Promise<InstanceType<typeof User>> {
  const email = "owner@foodflow.demo";
  const existing = await User.findOne({ email });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash("Owner@12345", 10);
  const owner = await User.create({
    name: "Demo Canteen Owner",
    email,
    passwordHash,
    role: "CANTEEN_OPERATOR",
    phone: "+91 90000 00001",
    walletBalance: 0,
  });
  console.log(`[Seed] Created demo owner: ${email} (Owner@12345)`);
  return owner;
}

async function ensureDefaultCanteen(): Promise<InstanceType<typeof Canteen>> {
  const existing = (await Canteen.findOne({ code: "MAIN" })) || (await Canteen.findOne()) || null;
  if (existing) return existing;

  const owner = await ensureDemoOwner();
  const canteen = await Canteen.create({
    ownerId: owner._id,
    name: "Main Canteen",
    code: "MAIN",
    description: "The original campus canteen. Fresh meals, snacks and beverages served all day.",
    category: "Multi-cuisine",
    tagline: "Your campus favourites, ready when you are.",
    announcement: "Welcome to FoodFlow! Order ahead and skip the queue.",
    institution: {
      collegeName: DEFAULT_COLLEGE,
      organizationName: DEFAULT_COLLEGE,
      logoUrl: null,
      location: "Shegaon, Maharashtra",
      campus: "Main Campus",
      building: "Student Centre",
      department: "Hospitality",
    },
    contact: {
      phone: "+91 90000 00001",
      email: "main@foodflow.demo",
      alternatePhone: "",
      address: `Student Centre, ${DEFAULT_COLLEGE}`,
    },
    branding: { ...DEFAULT_BRANDING },
    settings: { ...DEFAULT_SETTINGS },
    isActive: true,
  });
  console.log("[Seed] Created default canteen: Main Canteen (MAIN)");
  return canteen;
}

export async function seedIfEmpty(): Promise<void> {
  await ensureAdmin();
  const canteen = await ensureDefaultCanteen();

  const menuCount = await MenuItem.countDocuments();
  if (menuCount === 0) {
    await MenuItem.insertMany(
      DEFAULT_MENU.map((item) => ({
        ...item,
        stock: item.defaultStock,
        canteen: canteen._id,
      }))
    );
    const categories = [...new Set(DEFAULT_MENU.map((item) => item.category))];
    for (const name of categories) {
      await MenuCategory.updateOne(
        { canteen: canteen._id, name },
        { $setOnInsert: { sortOrder: 0 } },
        { upsert: true }
      );
    }
    console.log(`[Seed] Loaded ${DEFAULT_MENU.length} default menu items`);
  }

  // Safe, non-destructive migrations for records created before the current
  // features existed. Nothing is deleted.
  const menuMigration = await MenuItem.updateMany(
    { $or: [{ canteen: { $exists: false } }, { canteen: null }] },
    { $set: { canteen: canteen._id } }
  );
  if (menuMigration.modifiedCount > 0) {
    console.log(`[Seed] Linked ${menuMigration.modifiedCount} legacy menu items to ${canteen.code}`);
  }

  const orderMigration = await Order.updateMany(
    { $or: [{ canteen: { $exists: false } }, { canteen: null }] },
    { $set: { canteen: canteen._id } }
  );
  if (orderMigration.modifiedCount > 0) {
    console.log(`[Seed] Linked ${orderMigration.modifiedCount} legacy orders to ${canteen.code}`);
  }

  // Fill new settings that older documents do not have yet.
  const fieldDefaults: { filter: Record<string, unknown>; update: Record<string, unknown> }[] = [
    { filter: { "branding.backgroundSize": { $exists: false } }, update: { "branding.backgroundSize": "cover" } },
    { filter: { "branding.overlayColor": { $exists: false } }, update: { "branding.overlayColor": DEFAULT_BRANDING.overlayColor } },
    { filter: { "branding.overlayOpacity": { $exists: false } }, update: { "branding.overlayOpacity": DEFAULT_BRANDING.overlayOpacity } },
    { filter: { "institution.organizationName": { $exists: false } }, update: { "institution.organizationName": "" } },
    { filter: { "institution.logoUrl": { $exists: false } }, update: { "institution.logoUrl": null } },
    { filter: { "settings.preOpeningMinutes": { $exists: false } }, update: { "settings.preOpeningMinutes": 15 } },
    { filter: { "settings.dailySummaryHours": { $exists: false } }, update: { "settings.dailySummaryHours": 20 } },
    { filter: { "branding.primaryColor": { $exists: false } }, update: { "branding.primaryColor": DEFAULT_BRANDING.primaryColor } },
    { filter: { "branding.secondaryColor": { $exists: false } }, update: { "branding.secondaryColor": DEFAULT_BRANDING.secondaryColor } },
    { filter: { "branding.accentColor": { $exists: false } }, update: { "branding.accentColor": DEFAULT_BRANDING.accentColor } },
    { filter: { "branding.buttonColor": { $exists: false } }, update: { "branding.buttonColor": DEFAULT_BRANDING.buttonColor } },
  ];
  for (const { filter, update } of fieldDefaults) {
    await Canteen.updateMany(filter, { $set: update });
  }

  // Give legacy items a daily preparation quantity so an operating session can
  // restore stock correctly.
  const untracked = await MenuItem.find({
    defaultStock: { $in: [null, undefined] },
    stock: { $type: "number" },
  }).select("stock");
  for (const item of untracked) {
    await MenuItem.updateOne({ _id: item._id }, { $set: { defaultStock: item.stock } });
  }

  // Orders created before tokens/sessions existed stay valid; new orders get the
  // new fields automatically. Mark them as already-paid wallet history only when
  // the old record says so.
  await Order.updateMany(
    { orderSource: { $exists: false } },
    { $set: { orderSource: "STUDENT" } }
  );
}
