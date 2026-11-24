import type { Response } from "express";
import { User } from "../models/User.js";
import { hashPassword, comparePassword, generateToken } from "../utils/auth.js";
import { registerSchema, ownerRegisterSchema, loginSchema, updateProfileSchema } from "../utils/validation.js";
import { toUserJSON } from "../utils/serialize.js";
import { deleteLocalUpload } from "../utils/upload.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

export const register = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const { name, email, password, phone, studentId, employeeId } = validation.data;
    const accountType = validation.data.accountType || (validation.data.role === "STAFF" ? "EMPLOYEE" : "STUDENT");
    // The server maps account type to a role. A public request can never choose ADMIN or owner.
    const role: "STUDENT" | "FACULTY" | "STAFF" =
      accountType === "EMPLOYEE" ? "STAFF" : validation.data.role === "FACULTY" ? "FACULTY" : "STUDENT";

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role,
      accountType,
      studentId: accountType === "STUDENT" ? studentId?.trim() || undefined : undefined,
      employeeId: accountType === "EMPLOYEE" ? employeeId?.trim() || undefined : undefined,
      phone,
    });

    const token = generateToken({ userId: user._id.toString(), role: user.role });

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: toUserJSON(user),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Registration failed" });
  }
};

/** Dedicated owner sign-up. The role is assigned by the server, never by the browser. */
export const registerOwner = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const validation = ownerRegisterSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const { name, email, password, phone } = validation.data;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: "CANTEEN_OPERATOR",
      phone,
    });

    const token = generateToken({ userId: user._id.toString(), role: user.role });

    res.status(201).json({
      message: "Canteen owner account created successfully",
      token,
      user: toUserJSON(user),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Registration failed" });
  }
};

export const login = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const { email, password } = validation.data;
    const user = await User.findOne({ email });

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: "Your account has been deactivated. Contact support." });
      return;
    }

    const token = generateToken({ userId: user._id.toString(), role: user.role });

    res.status(200).json({
      message: "Login successful",
      token,
      user: toUserJSON(user),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Login failed" });
  }
};

export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(200).json({ user: toUserJSON(user) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Profile fetch failed" });
  }
};

/** Owners and students can update their own basic profile. Role and wallet are never editable here. */
export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const validation = updateProfileSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { name, email, phone, studentId, avatar, currentPassword, newPassword } = validation.data;
    const oldAvatar = user.avatar;

    if (email && email.toLowerCase() !== user.email) {
      const duplicate = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (duplicate) {
        res.status(409).json({ error: "An account with this email already exists." });
        return;
      }
      user.email = email.toLowerCase();
    }

    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (studentId !== undefined) user.studentId = studentId.trim() || undefined;
    if (avatar !== undefined) user.avatar = avatar || undefined;

    if (newPassword) {
      if (!currentPassword || !(await comparePassword(currentPassword, user.passwordHash))) {
        res.status(400).json({ error: "Current password is incorrect." });
        return;
      }
      user.passwordHash = await hashPassword(newPassword);
    }

    await user.save();

    if (avatar !== undefined && oldAvatar && oldAvatar !== avatar) {
      deleteLocalUpload(oldAvatar);
    }

    res.status(200).json({ message: "Profile updated", user: toUserJSON(user) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Profile update failed" });
  }
};
