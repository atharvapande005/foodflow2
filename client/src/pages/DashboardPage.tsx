import { useState, useEffect } from "react";
import { ArrowRight, Clock3, IndianRupee, PackageCheck, Store } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Metric from "@/components/Metric";
import FoodCard from "@/components/FoodCard";
import OrderCard from "@/components/OrderCard";
import Heading from "@/components/Heading";
import { CanteenLogo } from "@/components/CanteenIdentity";
import { useAuth } from "@/lib/auth";
import { useCanteen } from "@/lib/canteen";
import { menuAPI, orderAPI, type MenuItem, type Order } from "@/lib/api";

export default function DashboardPage() {
  const { user } = useAuth();
  const { currentCanteen, canteens, loading: canteenLoading } = useCanteen();
  const navigate = useNavigate();
  const [popularItems, setPopularItems] = useState<MenuItem[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!currentCanteen) {
      setPopularItems([]);
      setRecentOrders([]);
      return;
    }
    menuAPI
      .getAll({ canteenId: currentCanteen._id, popular: true })
      .then((r) => setPopularItems(r.data.items.slice(0, 4)))
      .catch(() => setPopularItems([]));
    orderAPI
      .getMyOrders({ canteenId: currentCanteen._id })
      .then((r) => setRecentOrders(r.data.orders.slice(0, 3)))
      .catch(() => setRecentOrders([]));
  }, [currentCanteen]);

  if (canteenLoading) return <div className="loading">Loading your canteen…</div>;

  if (!currentCanteen) {
    return (
      <section className="page">
        <div className="empty-state canteen-empty">
          <Store size={34} />
          <h2>No canteen selected</h2>
          <p>
            {canteens.length === 0
              ? "No canteens are available right now. Please check back soon."
              : "Choose a canteen to browse its menu and start ordering."}
          </p>
          {canteens.length > 0 && (
            <button className="primary" onClick={() => navigate("/canteens")}>
              Choose a canteen <ArrowRight size={15} />
            </button>
          )}
        </div>
      </section>
    );
  }

  const branding = currentCanteen.branding;
  const isOpen = currentCanteen.isActive && currentCanteen.settings.acceptingOrders;

  return (
    <section className="page">
      <div
        className="welcome canteen-hero"
        style={{
          background: `linear-gradient(135deg, ${branding.secondaryColor}, ${branding.primaryColor})`,
        }}
      >
        <div className="canteen-hero-copy">
          <div className="canteen-hero-brand">
            <CanteenLogo canteen={currentCanteen} size={58} />
            <div>
              <span className="eyebrow" style={{ color: "rgba(255,255,255,.72)" }}>
                {currentCanteen.institution?.collegeName || "CAMPUS CANTEEN"}
              </span>
              <h1>{currentCanteen.name}</h1>
              <p>{currentCanteen.tagline || currentCanteen.description}</p>
            </div>
          </div>
          <span className={`status ${isOpen ? "status-ready" : "status-cancelled"}`}>
            {isOpen ? "Accepting orders" : "Currently closed"}
          </span>
          {currentCanteen.announcement && (
            <p className="canteen-announcement">{currentCanteen.announcement}</p>
          )}
          <div className="canteen-hero-actions">
            <button className="primary" onClick={() => navigate("/menu")}>
              Browse menu <ArrowRight size={16} />
            </button>
            <Link to="/canteens" className="ghost light">
              Switch canteen <Store size={15} />
            </Link>
          </div>
        </div>
        <div className="food-art">
          <span>🍜</span>
          <span>🥤</span>
          <span>🍛</span>
        </div>
      </div>

      <div className="metrics">
        <Metric
          label="Wallet balance"
          value={`₹${user?.walletBalance ?? 0}`}
          Icon={IndianRupee}
          delta="Ready for your next order"
        />
        <Metric
          label="Your recent orders"
          value={`${recentOrders.length}`}
          Icon={PackageCheck}
          delta={`At ${currentCanteen.name}`}
        />
        <Metric
          label="Popular items"
          value={`${popularItems.length}`}
          Icon={Clock3}
          delta="Trending in this canteen"
        />
      </div>

      {currentCanteen.institution?.collegeName && (
        <div className="canteen-info-strip">
          <span>
            <b>College</b> {currentCanteen.institution.collegeName}
          </span>
          {currentCanteen.institution.campus && (
            <span>
              <b>Campus</b> {currentCanteen.institution.campus}
            </span>
          )}
          {currentCanteen.institution.building && (
            <span>
              <b>Location</b> {currentCanteen.institution.building}
            </span>
          )}
          {currentCanteen.settings.openingTime && (
            <span>
              <b>Hours</b> {currentCanteen.settings.openingTime} – {currentCanteen.settings.closingTime}
            </span>
          )}
        </div>
      )}

      <div className="section-title">
        <h2>Popular right now</h2>
        <p>Student favourites from {currentCanteen.name}.</p>
      </div>
      {popularItems.length === 0 ? (
        <div className="empty-state">This canteen has not marked any popular items yet.</div>
      ) : (
        <div className="foods">
          {popularItems.map((item) => (
            <FoodCard key={item._id} item={item} onAdd={() => navigate("/menu")} />
          ))}
        </div>
      )}

      {recentOrders.length > 0 && (
        <>
          <div className="section-title second">
            <h2>Recent orders</h2>
            <p>Your latest activity at {currentCanteen.name}.</p>
          </div>
          <div className="orders">
            {recentOrders.map((o) => (
              <OrderCard key={o._id} order={o} />
            ))}
          </div>
        </>
      )}

      {recentOrders.length === 0 && (
        <div className="section-title second">
          <Heading title="No orders yet" sub="Place your first order to get started!" />
        </div>
      )}
    </section>
  );
}
