import { Search, Bell, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import CanteenSwitcher from "./CanteenSwitcher";
import { useAuth } from "@/lib/auth";

interface HeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  cartCount?: number;
}

export default function Header({ search, onSearchChange, cartCount = 0 }: HeaderProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const isAdmin = user.role === "ADMIN";
  const isOwner = user.role === "CANTEEN_OPERATOR";
  const isStudent = !isAdmin && !isOwner;

  const openProfile = () => {
    if (isOwner) navigate("/owner/profile");
    else if (isAdmin) navigate("/admin/profile");
    else navigate("/profile");
  };

  return (
    <header className="top">
      <div className="search">
        <Search size={17} />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={
            isAdmin
              ? "Search orders, users, canteens…"
              : isOwner
                ? "Search orders, menu items…"
                : "Search the menu…"
          }
        />
      </div>
      <div className="top-actions">
        {isStudent && <CanteenSwitcher variant="header" />}
        <button className="icon" aria-label="Notifications">
          <Bell size={18} />
          <i />
        </button>
        {isStudent && (
          <button className="icon" onClick={() => navigate("/menu")} aria-label="Cart">
            <ShoppingCart size={18} />
            {cartCount > 0 && <b>{cartCount}</b>}
          </button>
        )}
        <button className="profile" onClick={openProfile} title="My profile">
          <Avatar name={user.name} src={user.avatar} />
          <span>{user.name}</span>
        </button>
      </div>
    </header>
  );
}
