import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { canteenAPI, type Canteen } from "./api";
import { useAuth } from "./auth";

const SELECTED_KEY = "foodflow_selected_canteen";

interface CanteenContextType {
  canteens: Canteen[];
  currentCanteen: Canteen | null;
  loading: boolean;
  selectCanteen: (id: string | null) => void;
  refreshCanteens: () => Promise<void>;
  refreshCurrentCanteen: () => Promise<void>;
}

const CanteenContext = createContext<CanteenContextType | null>(null);

export function CanteenProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [canteens, setCanteens] = useState<Canteen[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(SELECTED_KEY));
  const [loading, setLoading] = useState(true);

  const refreshCanteens = useCallback(async () => {
    if (!token || !user) {
      setCanteens([]);
      setLoading(false);
      return;
    }
    if (user.role === "STUDENT" || user.role === "FACULTY" || user.role === "STAFF") {
      const res = await canteenAPI.list();
      setCanteens(res.data.canteens);
    } else {
      const res = await canteenAPI.mine();
      setCanteens(res.data.canteens);
    }
    setLoading(false);
  }, [token, user]);

  useEffect(() => {
    refreshCanteens().catch(() => setLoading(false));
  }, [refreshCanteens]);

  useEffect(() => {
    if (loading) return;
    if (canteens.length === 0) {
      if (currentId) {
        setCurrentId(null);
        localStorage.removeItem(SELECTED_KEY);
      }
      return;
    }
    const stored = currentId;
    const valid = stored && canteens.some((c) => c._id === stored);
    if (!valid) {
      const next = canteens[0]._id;
      setCurrentId(next);
      localStorage.setItem(SELECTED_KEY, next);
    }
  }, [canteens, currentId, loading]);

  const selectCanteen = useCallback((id: string | null) => {
    setCurrentId(id);
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
  }, []);

  const refreshCurrentCanteen = useCallback(async () => {
    const id = currentId || localStorage.getItem(SELECTED_KEY);
    if (!id) return;
    try {
      const res = await canteenAPI.get(id);
      setCanteens((prev) => prev.map((c) => (c._id === id ? res.data.canteen : c)));
    } catch {
      // The canteen may have been removed or made private; refresh the list.
      await refreshCanteens().catch(() => undefined);
    }
  }, [currentId, refreshCanteens]);

  const currentCanteen = canteens.find((c) => c._id === currentId) || null;

  return (
    <CanteenContext.Provider
      value={{ canteens, currentCanteen, loading, selectCanteen, refreshCanteens, refreshCurrentCanteen }}
    >
      {children}
    </CanteenContext.Provider>
  );
}

export function useCanteen(): CanteenContextType {
  const ctx = useContext(CanteenContext);
  if (!ctx) throw new Error("useCanteen must be used within CanteenProvider");
  return ctx;
}

export function brandingStyle(canteen: Canteen | null): React.CSSProperties {
  if (!canteen) return {};
  return {
    ["--canteen-primary" as string]: canteen.branding.primaryColor,
    ["--canteen-secondary" as string]: canteen.branding.secondaryColor,
    ["--canteen-accent" as string]: canteen.branding.accentColor,
    ["--canteen-button" as string]: canteen.branding.buttonColor,
  };
}

export function defaultBranding() {
  return {
    logoUrl: null as string | null,
    backgroundUrl: null as string | null,
    backgroundOpacity: 0.4,
    backgroundPosition: "center",
    backgroundSize: "cover",
    overlayColor: "#302820",
    overlayOpacity: 0.3,
    primaryColor: "#70452B",
    secondaryColor: "#493021",
    accentColor: "#D98236",
    buttonColor: "#D98236",
    logoScale: 1,
  };
}
