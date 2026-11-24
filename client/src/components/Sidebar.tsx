import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  PackageCheck,
  Menu,
  BarChart3,
  Users,
  LogOut,
  Store,
  Palette,
  Boxes,
  Settings,
  UserRound,
  Building2,
  IndianRupee,
} from "lucide-react";
import Brand from "./Brand";
import Avatar from "./Avatar";
import CanteenSwitcher from "./CanteenSwitcher";
import { useAuth } from "@/lib/auth";

const adminLinks = [
  { to: "/", label: "Platform overview", icon: LayoutDashboard },
  { to: "/admin/canteens", label: "Canteens", icon: Building2 },
  { to: "/admin/orders", label: "All orders", icon: PackageCheck },
  { to: "/admin/menu", label: "Menu manager", icon: Menu },
  { to: "/admin/analytics", label: "Platform analytics", icon: BarChart3 },
  { to: "/admin/revenue", label: "Revenue", icon: IndianRupee },
  { to: "/admin/users", label: "Users & owners", icon: Users },
  { to: "/admin/branding", label: "Branding & appearance", icon: Palette },
  { to: "/admin/profile", label: "My profile", icon: UserRound },
];

const ownerLinks = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/owner/canteen", label: "Canteen profile", icon: Store },
  { to: "/owner/branding", label: "Branding & appearance", icon: Palette },
  { to: "/owner/menu", label: "Menu management", icon: Menu },
  { to: "/owner/orders", label: "Orders", icon: PackageCheck },
  { to: "/owner/cash", label: "Cash payments", icon: IndianRupee },
  { to: "/owner/inventory", label: "Inventory", icon: Boxes },
  { to: "/owner/revenue", label: "Revenue", icon: BarChart3 },
  { to: "/owner/settings", label: "Settings", icon: Settings },
  { to: "/owner/profile", label: "My profile", icon: UserRound },
];

const userLinks = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/canteens", label: "Canteens", icon: Store },
  { to: "/menu", label: "Canteen menu", icon: Menu },
  { to: "/orders", label: "My orders", icon: PackageCheck },
  { to: "/wallet", label: "Wallet", icon: BarChart3 },
  { to: "/profile", label: "My profile", icon: UserRound },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const isAdmin = user.role === "ADMIN";
  const isOwner = user.role === "CANTEEN_OPERATOR";
  const links = isAdmin ? adminLinks : isOwner ? ownerLinks : userLinks;
  const label = isAdmin ? "PLATFORM CONTROL" : isOwner ? "CANTEEN STUDIO" : "CAMPUS FOOD";
  const roleLabel = isAdmin ? "Administrator" : isOwner ? "Canteen owner" : user.role.replace("_", " ").toLowerCase();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <aside className="side">
      <Brand usePlatformLogo />
      <span className="side-label">{label}</span>
      {(isAdmin || isOwner) && <CanteenSwitcher />}
      <nav>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) => (isActive ? "nav active" : "nav")}
          >
            <link.icon size={19} />
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="side-bottom">
        <div className="mini-profile">
          <Avatar name={user.name} src={user.avatar} />
          <div>
            <b>{user.name}</b>
            <span>{roleLabel}</span>
          </div>
        </div>
        <button className="nav" onClick={handleLogout}>
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
