import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CanteenProvider } from "@/lib/canteen";
import { ToastProvider } from "@/lib/toast";
import AuthPage from "@/pages/AuthPage";
import DashboardLayout from "@/layouts/DashboardLayout";
import DashboardPage from "@/pages/DashboardPage";
import CanteenSelectionPage from "@/pages/CanteenSelectionPage";
import MenuPage from "@/pages/MenuPage";
import MyOrdersPage from "@/pages/MyOrdersPage";
import WalletPage from "@/pages/WalletPage";
import AdminOverviewPage from "@/pages/AdminOverviewPage";
import AdminOrdersPage from "@/pages/AdminOrdersPage";
import AdminMenuPage from "@/pages/AdminMenuPage";
import AdminAnalyticsPage from "@/pages/AdminAnalyticsPage";
import AdminUsersPage from "@/pages/AdminUsersPage";
import AdminCanteensPage from "@/pages/AdminCanteensPage";
import OwnerOverviewPage from "@/pages/owner/OwnerOverviewPage";
import OwnerCanteenPage from "@/pages/owner/OwnerCanteenPage";
import OwnerBrandingPage from "@/pages/owner/OwnerBrandingPage";
import OwnerMenuPage from "@/pages/owner/OwnerMenuPage";
import OwnerOrdersPage from "@/pages/owner/OwnerOrdersPage";
import OwnerInventoryPage from "@/pages/owner/OwnerInventoryPage";
import OwnerSettingsPage from "@/pages/owner/OwnerSettingsPage";
import OwnerProfilePage from "@/pages/owner/OwnerProfilePage";
import OwnerCashPage from "@/pages/owner/CashPaymentsPage";
import OwnerRevenuePage from "@/pages/owner/RevenuePage";
import AdminRevenuePage from "@/pages/AdminRevenuePage";
import AdminBrandingPage from "@/pages/AdminBrandingPage";
import ProfilePage from "@/pages/ProfilePage";
import PublicQrPage from "@/pages/PublicQrPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading-screen">Loading…</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/qr/:code" element={<PublicQrPage />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  const isAdmin = user.role === "ADMIN";
  const isOwner = user.role === "CANTEEN_OPERATOR";

  return (
    <Routes>
      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        {isAdmin && (
          <>
            <Route index element={<AdminOverviewPage />} />
            <Route path="admin/canteens" element={<AdminCanteensPage />} />
            <Route path="admin/orders" element={<AdminOrdersPage />} />
            <Route path="admin/menu" element={<AdminMenuPage />} />
            <Route path="admin/analytics" element={<AdminAnalyticsPage />} />
            <Route path="admin/revenue" element={<AdminRevenuePage />} />
            <Route path="admin/users" element={<AdminUsersPage />} />
            <Route path="admin/branding" element={<AdminBrandingPage />} />
            <Route path="admin/profile" element={<ProfilePage />} />
            <Route path="canteens" element={<CanteenSelectionPage />} />
          </>
        )}

        {isOwner && (
          <>
            <Route index element={<OwnerOverviewPage />} />
            <Route path="owner/canteen" element={<OwnerCanteenPage />} />
            <Route path="owner/branding" element={<OwnerBrandingPage />} />
            <Route path="owner/menu" element={<OwnerMenuPage />} />
            <Route path="owner/orders" element={<OwnerOrdersPage />} />
            <Route path="owner/cash" element={<OwnerCashPage />} />
            <Route path="owner/inventory" element={<OwnerInventoryPage />} />
            <Route path="owner/revenue" element={<OwnerRevenuePage />} />
            <Route path="owner/settings" element={<OwnerSettingsPage />} />
            <Route path="owner/profile" element={<OwnerProfilePage />} />
            <Route path="canteens" element={<CanteenSelectionPage />} />
          </>
        )}

        {!isAdmin && !isOwner && (
          <>
            <Route index element={<DashboardPage />} />
            <Route path="canteens" element={<CanteenSelectionPage />} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="orders" element={<MyOrdersPage />} />
            <Route path="wallet" element={<WalletPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </>
        )}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="/qr/:code" element={<PublicQrPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CanteenProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </CanteenProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
