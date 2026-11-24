import { User } from "../models/User.js";

export interface UserJSON {
  id: string;
  name: string;
  email: string;
  role: string;
  accountType?: string;
  studentId?: string;
  employeeId?: string;
  phone?: string;
  avatar?: string;
  walletBalance: number;
  isActive: boolean;
  createdAt: Date;
}

export function toUserJSON(user: InstanceType<typeof User>): UserJSON {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    accountType: user.accountType,
    studentId: user.studentId,
    employeeId: user.employeeId,
    phone: user.phone,
    avatar: user.avatar,
    walletBalance: user.walletBalance,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}
