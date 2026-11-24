import { Plus, ArrowRight, ImageOff } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { MenuItem } from "@/lib/api";

export default function FoodCard({
  item,
  onAdd,
  disabled = false,
}: {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
  disabled?: boolean;
}) {
  const outOfStock = typeof item.stock === "number" && item.stock <= 0;
  const lowStock = typeof item.stock === "number" && item.stock > 0 && item.stock <= (item.lowStockThreshold || 5);
  const unavailable = disabled || outOfStock;

  return (
    <article className={`food ${unavailable ? "food-disabled" : ""}`}>
      <div className="food-image">
        {item.image ? (
          <img src={item.image} alt={item.name} className="food-photo" />
        ) : (
          <span>{item.emoji || "🍽️"}</span>
        )}
        {item.popular && <b>Popular</b>}
        {outOfStock && <em className="sold-out">Sold out</em>}
        {!outOfStock && lowStock && <em className="low-stock">Only {item.stock} left</em>}
      </div>
      <div className="food-body">
        <div>
          <h3>{item.name}</h3>
          <p>{item.category}</p>
          {item.description && <small className="food-desc">{item.description}</small>}
        </div>
        <div className="food-bottom">
          <strong>{formatCurrency(item.price)}</strong>
          <button
            onClick={() => onAdd(item)}
            disabled={unavailable}
            title={outOfStock ? "Out of stock" : disabled ? "Canteen closed" : `Add ${item.name}`}
          >
            {outOfStock ? <ImageOff size={16} /> : <Plus size={17} />}
          </button>
        </div>
      </div>
    </article>
  );
}

export function CartBar({
  items,
  onClear,
  onPlaceOrder,
  disabled = false,
  placing = false,
}: {
  items: { item: MenuItem; quantity: number }[];
  onClear: () => void;
  onPlaceOrder: () => void;
  disabled?: boolean;
  placing?: boolean;
}) {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + i.item.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="cart">
      <div>
        <b>
          {count} item{count > 1 ? "s" : ""} in cart
        </b>
        <span>Total {formatCurrency(total)}</span>
      </div>
      <div>
        <button className="ghost" onClick={onClear}>
          Clear
        </button>
        <button className="primary" onClick={onPlaceOrder} disabled={disabled}>
          {placing ? "Placing…" : "Place order"} <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
