import { useState } from "react";
import { ArrowRight, BarChart3, Clock3, GraduationCap, PackageCheck, Sparkles, Store } from "lucide-react";
import Brand from "@/components/Brand";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

export default function AuthPage() {
  const { login, register, registerOwner } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [accountType, setAccountType] = useState<"student" | "owner">("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setPhone("");
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else if (accountType === "owner") {
        await registerOwner({ name, email, password, phone: phone || undefined });
      } else {
        await register({ name, email, password, phone: phone || undefined });
      }
      toast(mode === "login" ? "Welcome back!" : "Account created successfully");
    } catch (err: unknown) {
      const serverMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err as { message?: string })?.message;
      if (!serverMsg) {
        setError("Something went wrong. Please try again.");
      } else if (serverMsg.toLowerCase().includes("network") || serverMsg.toLowerCase().includes("failed to fetch")) {
        setError("Could not reach the server. Check your connection and try again.");
      } else {
        setError(serverMsg);
      }
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    resetForm();
    setMode(mode === "login" ? "register" : "login");
  };

  return (
    <div className="auth">
      <section className="auth-left">
        <Brand />
        <div className="auth-copy">
          <span className="eyebrow">
            <Sparkles size={13} />
            MULTI-CANTEEN CAMPUS FOOD PLATFORM
          </span>
          <h1>
            Every canteen.
            <br />
            <em>One flow.</em>
          </h1>
          <p>Order ahead from your favourite campus canteen, or run your own branded canteen with FoodFlow.</p>
          <div className="points">
            <span>
              <PackageCheck size={17} />
              Live order tracking
            </span>
            <span>
              <Store size={17} />
              Independent canteen branding
            </span>
            <span>
              <BarChart3 size={17} />
              Canteen-level insights
            </span>
            <span>
              <Clock3 size={17} />
              Faster pickup workflow
            </span>
          </div>
        </div>
      </section>
      <section className="auth-right">
        <div className="card">
          <div className="mobile-brand">
            <Brand />
          </div>
          <small>{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</small>
          <h2>{mode === "login" ? "Sign in to your account" : "Create your account"}</h2>
          <p className="muted">
            {mode === "login"
              ? "Enter your credentials to access your account."
              : accountType === "owner"
                ? "Register as a canteen owner and build your canteen identity."
                : "Join your campus food network and start ordering."}
          </p>

          {mode === "register" && (
            <div className="roles">
              <button
                type="button"
                className={accountType === "student" ? "on" : ""}
                onClick={() => setAccountType("student")}
              >
                <GraduationCap size={16} /> Student
              </button>
              <button
                type="button"
                className={accountType === "owner" ? "on" : ""}
                onClick={() => setAccountType("owner")}
              >
                <Store size={16} /> Canteen owner
              </button>
            </div>
          )}

          <form onSubmit={submit}>
            {mode === "register" && (
              <>
                <label>
                  Full name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={accountType === "owner" ? "Owner's full name" : "Your full name"}
                    required
                  />
                </label>
                <label>
                  Phone (optional)
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 XXXXX XXXXX"
                  />
                </label>
              </>
            )}
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@college.edu"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Min 6 characters" : "Enter your password"}
                required
                minLength={mode === "register" ? 6 : undefined}
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="primary full" disabled={busy}>
              {busy
                ? mode === "login"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "login"
                  ? "Sign in"
                  : accountType === "owner"
                    ? "Create owner account"
                    : "Create account"}
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="switch">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button onClick={switchMode}>{mode === "login" ? "Sign up" : "Sign in"}</button>
          </div>
          {mode === "register" && accountType === "owner" && (
            <div className="auth-note">
              Owner accounts can create and manage their own canteens. Administrator accounts are created by the platform.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
