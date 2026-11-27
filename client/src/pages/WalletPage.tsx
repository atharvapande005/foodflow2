import { useState, useEffect } from "react";
import Heading from "@/components/Heading";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { walletAPI, type Transaction } from "@/lib/api";
import { formatCurrency, getStatusColor, timeAgo } from "@/lib/utils";
import { loadRazorpayScript } from "@/lib/razorpay";

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

  const errorText = (err: unknown, fallback: string): string =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

  const reloadTransactions = () =>
    walletAPI
      .getTransactions()
      .then((r) => setTransactions(r.data.transactions))
      .catch(() => undefined);

  // The wallet is only credited after Razorpay confirms the payment to our server.
  const handleTopup = async () => {
    const val = parseInt(amount);
    if (!val || val < 10) {
      toast("Minimum top-up is ₹10");
      return;
    }
    if (val > 10000) {
      toast("Maximum top-up is ₹10,000");
      return;
    }
    setTopping(true);
    try {
      const created = await walletAPI.createTopupOrder(val);
      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay || !created.data.payment.keyId) {
        toast("Could not open the payment window. Check your connection and try again.");
        setTopping(false);
        return;
      }
      const payment = created.data.payment;
      const checkout = new window.Razorpay({
        key: payment.keyId as string,
        amount: payment.amount,
        currency: payment.currency,
        name: "FoodFlow wallet",
        description: `Add ₹${val} to wallet`,
        order_id: payment.razorpayOrderId,
        prefill: { name: user?.name, email: user?.email, contact: user?.phone },
        handler: async (response) => {
          try {
            const verified = await walletAPI.verifyTopup({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            if (typeof verified.data.walletBalance === "number") {
              updateWallet(verified.data.walletBalance);
            } else {
              const balance = await walletAPI.getBalance();
              updateWallet(balance.data.walletBalance);
            }
            setAmount("");
            toast(`₹${val} added to wallet!`);
            await reloadTransactions();
          } catch (err: unknown) {
            toast(errorText(err, "Payment received but the wallet could not be updated. Contact the canteen."));
          } finally {
            setTopping(false);
          }
        },
        modal: {
          ondismiss: () => {
            setTopping(false);
          },
        },
      });
      checkout.open();
    } catch (err: unknown) {
      toast(errorText(err, "Top-up failed. Try again."));
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
