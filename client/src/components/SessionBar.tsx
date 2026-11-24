import { useCallback, useEffect, useState } from "react";
import { Clock, Play, Power, ShieldCheck } from "lucide-react";
import { canteenAPI, type OperatingSession } from "@/lib/api";
import { useCanteen } from "@/lib/canteen";
import { useToast } from "@/lib/toast";

function formatTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatToken(value?: number | null): string {
  if (!value) return "—";
  return `#${String(value).padStart(3, "0")}`;
}

export default function SessionBar({
  canteenId,
  onChanged,
}: {
  canteenId: string;
  onChanged?: () => void;
}) {
  const { refreshCurrentCanteen } = useCanteen();
  const { toast } = useToast();
  const [session, setSession] = useState<OperatingSession | null>(null);
  const [ordersCount, setOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!canteenId) return;
    try {
      const res = await canteenAPI.getSession(canteenId);
      setSession(res.data.session);
      setOrdersCount(res.data.ordersCount || 0);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [canteenId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const start = async () => {
    setBusy(true);
    try {
      const res = await canteenAPI.startSession(canteenId);
      setSession(res.data.session);
      setOrdersCount(0);
      await refreshCurrentCanteen();
      toast("Canteen opened — token sequence starts at #001");
      onChanged?.();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Could not start the canteen");
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (
      !window.confirm(
        "Close this operating session? New orders will stop and the next start resets tokens to #001. Existing orders are kept."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await canteenAPI.closeSession(canteenId);
      setSession(res.data.session);
      await refreshCurrentCanteen();
      toast("Canteen closed. Existing orders are still available.");
      onChanged?.();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Could not close the canteen");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="session-bar">Checking session…</div>;

  const isOpen = session?.status === "OPEN";

  return (
    <div className="session-bar">
      <span className="session-state">
        <span className={`session-dot ${isOpen ? "open" : ""}`} />
        {isOpen ? "Session open" : "Session closed"}
      </span>
      <div className="session-meta">
        <span>
          Tokens issued <b>{session?.tokenCounter ?? 0}</b>
        </span>
        <span>
          Last token <b>{formatToken(session?.tokenCounter)}</b>
        </span>
        <span>
          Opened <b>{formatTime(session?.openedAt)}</b>
        </span>
        <span>
          Orders this session <b>{ordersCount}</b>
        </span>
      </div>
      <div className="session-actions">
        {isOpen ? (
          <button className="btn-close" onClick={close} disabled={busy}>
            <Power size={14} /> {busy ? "Closing…" : "Close session"}
          </button>
        ) : (
          <button className="btn-start" onClick={start} disabled={busy}>
            {busy ? <Clock size={14} /> : <Play size={14} />}
            {busy ? "Opening…" : "Start session"}
          </button>
        )}
      </div>
      <span title="Tokens restart every operating session; historical orders are retained.">
        <ShieldCheck size={15} color="var(--success)" />
      </span>
    </div>
  );
}
