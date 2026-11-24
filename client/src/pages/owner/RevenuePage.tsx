import { useNavigate } from "react-router-dom";
import { BarChart3, Store } from "lucide-react";
import RevenuePanel from "@/components/RevenuePanel";
import { useCanteen } from "@/lib/canteen";

export default function OwnerRevenuePage() {
  const { currentCanteen, loading } = useCanteen();
  const navigate = useNavigate();

  if (loading) return <div className="loading">Loading canteen…</div>;

  if (!currentCanteen) {
    return (
      <section className="page">
        <div className="empty-state canteen-empty">
          <BarChart3 size={34} />
          <h2>Create a canteen first</h2>
          <p>Revenue is reported per canteen so your data stays isolated.</p>
          <button className="primary" onClick={() => navigate("/owner/canteen")}>
            <Store size={15} /> Set up canteen
          </button>
        </div>
      </section>
    );
  }

  return (
    <RevenuePanel
      title="Revenue"
      sub={`Cash, online and wallet revenue for ${currentCanteen.name}. Financial history is never deleted.`}
      canteenId={currentCanteen._id}
    />
  );
}
