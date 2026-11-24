import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, MapPin, Phone, Search, Store } from "lucide-react";
import Heading from "@/components/Heading";
import { CanteenLogo } from "@/components/CanteenIdentity";
import { useCanteen } from "@/lib/canteen";

export default function CanteenSelectionPage() {
  const { canteens, currentCanteen, selectCanteen, loading } = useCanteen();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const filtered = useMemo(
    () =>
      canteens.filter(
        (canteen) =>
          canteen.name.toLowerCase().includes(search.toLowerCase()) ||
          canteen.institution?.collegeName?.toLowerCase().includes(search.toLowerCase()) ||
          canteen.description?.toLowerCase().includes(search.toLowerCase())
      ),
    [canteens, search]
  );

  const enter = (id: string) => {
    selectCanteen(id);
    navigate("/menu");
  };

  return (
    <section className="page">
      <Heading
        title="Choose your canteen"
        sub="Each canteen has its own menu, branding and operating hours."
      />
      <div className="search-bar canteen-search">
        <Search size={17} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search canteens or colleges…"
          className="menu-search"
        />
      </div>

      {loading ? (
        <div className="loading">Loading canteens…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Store size={28} style={{ marginBottom: 10 }} />
          <p>No canteens match your search yet.</p>
        </div>
      ) : (
        <div className="canteen-grid">
          {filtered.map((canteen) => {
            const branding = canteen.branding;
            return (
              <article
                key={canteen._id}
                className={`canteen-card ${currentCanteen?._id === canteen._id ? "selected" : ""}`}
                style={{ borderColor: currentCanteen?._id === canteen._id ? branding.primaryColor : undefined }}
              >
                <div
                  className="canteen-card-cover"
                  style={
                    branding.backgroundUrl
                      ? {
                          backgroundImage: `url(${branding.backgroundUrl})`,
                          backgroundPosition: branding.backgroundPosition,
                        }
                      : {
                          background: `linear-gradient(135deg, ${branding.secondaryColor}, ${branding.primaryColor})`,
                        }
                  }
                >
                  <div
                    className="canteen-card-cover-overlay"
                    style={{ background: branding.overlayColor, opacity: branding.overlayOpacity }}
                  />
                  <span className={`status ${canteen.isActive && canteen.settings.acceptingOrders ? "status-ready" : "status-cancelled"}`}>
                    {canteen.isActive && canteen.settings.acceptingOrders ? "Open" : "Closed"}
                  </span>
                  <CanteenLogo canteen={canteen} size={58} className="canteen-card-logo" />
                </div>
                <div className="canteen-card-body">
                  <small>{canteen.institution?.collegeName || "Campus canteen"}</small>
                  <h3>{canteen.name}</h3>
                  <p>{canteen.description || canteen.tagline || "Fresh food served on campus."}</p>
                  <div className="canteen-card-meta">
                    {canteen.institution?.building && (
                      <span>
                        <MapPin size={13} /> {canteen.institution.building}
                      </span>
                    )}
                    {canteen.contact?.phone && (
                      <span>
                        <Phone size={13} /> {canteen.contact.phone}
                      </span>
                    )}
                  </div>
                  <button
                    className="primary full"
                    style={{ background: branding.buttonColor }}
                    onClick={() => enter(canteen._id)}
                  >
                    {currentCanteen?._id === canteen._id ? "Continue to menu" : "Enter canteen"}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
