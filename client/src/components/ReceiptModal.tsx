import { useEffect, useRef } from "react";
import { Printer, X } from "lucide-react";
import type { Canteen, Order } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

function tokenLabel(token?: number | null): string {
  if (!token) return "—";
  return `#${String(token).padStart(3, "0")}`;
}

function customerName(order: Order): string {
  if (order.user && typeof order.user === "object") return order.user.name;
  return order.guestName || (order.orderSource === "COUNTER" ? "Counter sale" : "Guest");
}

function ReceiptBody({ order, canteen }: { order: Order; canteen: Canteen }) {
  const logo = canteen.branding?.logoUrl;
  return (
    <>
      <div className="receipt-head">
        {logo && <img src={logo} alt="" />}
        <h3>{canteen.name}</h3>
        <p>{canteen.institution?.collegeName || ""}</p>
        {canteen.contact?.phone && <p>{canteen.contact.phone}</p>}
      </div>
      <div className="receipt-token">{tokenLabel(order.token)}</div>
      <p style={{ textAlign: "center", margin: "0 0 6px" }}>Order {order.orderNumber}</p>
      <table>
        <tbody>
          {order.items.map((item, index) => (
            <tr key={`${item.menuItem}-${index}`}>
              <td>
                {item.name} × {item.quantity}
              </td>
              <td style={{ textAlign: "right" }}>{formatCurrency(item.price * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="receipt-total">
        <span>Total</span>
        <span>{formatCurrency(order.totalAmount)}</span>
      </div>
      <p style={{ margin: "6px 0 0" }}>
        {order.paymentMethod} · {order.paymentStatus}
      </p>
      <p style={{ margin: "2px 0 0" }}>Customer: {customerName(order)}</p>
      <p style={{ margin: "2px 0 0" }}>{new Date(order.createdAt).toLocaleString()}</p>
      <div className="receipt-foot">
        <p style={{ margin: 0 }}>Please keep this token and collect at the counter.</p>
        <p style={{ margin: 0 }}>Thank you for ordering from FoodFlow.</p>
      </div>
    </>
  );
}

export default function ReceiptModal({
  order,
  canteen,
  onClose,
}: {
  order: Order;
  canteen: Canteen;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const print = () => {
    window.print();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Token receipt</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
              Use your browser or thermal printer dialog. Paper size is preset to 80mm.
            </p>
          </div>
          <button className="icon" onClick={onClose} aria-label="Close receipt">
            <X size={16} />
          </button>
        </div>

        <div className="receipt-screen">
          <ReceiptBody order={order} canteen={canteen} />
        </div>

        {/* Only this block becomes visible in @media print. */}
        <div className="receipt-print" ref={printRef}>
          <ReceiptBody order={order} canteen={canteen} />
        </div>

        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            Close
          </button>
          <button className="primary" onClick={print}>
            <Printer size={15} /> Print receipt
          </button>
        </div>
      </div>
    </div>
  );
}

export { tokenLabel };
