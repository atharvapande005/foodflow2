import { useState, useEffect } from "react";
import Heading from "@/components/Heading";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { walletAPI, type Transaction } from "@/lib/api";
import { formatCurrency, getStatusColor, timeAgo } from "@/lib/utils";

export default function WalletPage() {
  const { user, updateWallet } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topping, setTopping] = useState(false);

  useEffect(() => {
    walletAPI
      .getTransactions()
      .then((r) => setTransactions(r.data.transactions))
      .finally(() => setLoading(false));
  }, []);

  const handleTopup = async () => {
    const val = parseInt(amount);
    if (!val || val < 10) {
      toast("Minimum top-up is ₹10");
      return;
    }
    setTopping(true);
    try {
      const res = await walletAPI.topup(val);
      updateWallet(res.data.walletBalance);
      setTransactions((prev) => [res.data.transaction, ...prev]);
      setAmount("");
      toast(`₹${val} added to wallet!`);
    } catch {
      toast("Top-up failed. Try again.");
    } finally {
      setTopping(false);
    }
  };

  return (
    <section className="page">
      <Heading title="My wallet" sub="Manage your canteen balance and transactions." />
      <div className="wallet-card">
        <div className="wallet-balance">
          <span className="eyebrow dark">AVAILABLE BALANCE</span>
          <h2>{formatCurrency(user?.walletBalance ?? 0)}</h2>
        </div>
        <div className="wallet-topup">
          <label>
            Top-up amount
            <div className="topup-row">
              <input
                type="number"
                min="10"
                max="10000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
              />
              <button className="primary" onClick={handleTopup} disabled={topping}>
                {topping ? "Processing…" : "Add funds"}
              </button>
            </div>
          </label>
          <div className="quick-amounts">
            {[50, 100, 200, 500].map((v) => (
              <button key={v} className="chip" onClick={() => setAmount(String(v))}>
                ₹{v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="section-title">
        <h2>Transaction history</h2>
        <p>Your recent wallet activity.</p>
      </div>
      {loading ? (
        <div className="loading">Loading…</div>
      ) : transactions.length === 0 ? (
        <div className="empty-state">No transactions yet.</div>
      ) : (
        <div className="transactions">
          {transactions.map((tx) => (
            <div key={tx._id} className="transaction">
              <div>
                <span className={`tx-type ${getStatusColor(tx.type)}`}>{tx.type.replace("_", " ")}</span>
                <strong>{tx.description}</strong>
                <small>{timeAgo(tx.createdAt)}</small>
              </div>
              <div className="tx-amount">
                <strong className={tx.amount >= 0 ? "positive" : "negative"}>
                  {tx.amount >= 0 ? "+" : ""}
                  {formatCurrency(tx.amount)}
                </strong>
                <small>Balance: {formatCurrency(tx.balanceAfter)}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
