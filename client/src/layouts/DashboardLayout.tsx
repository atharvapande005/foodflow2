import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import CanteenBackdrop from "@/components/CanteenBackdrop";
import { useAuth } from "@/lib/auth";
import { brandingStyle, useCanteen } from "@/lib/canteen";

export default function DashboardLayout() {
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const { currentCanteen } = useCanteen();
  const isStudent =
    user?.role === "STUDENT" || user?.role === "FACULTY" || user?.role === "STAFF";

  return (
    <div className={`app ${isStudent && currentCanteen ? "app-themed" : ""}`}>
      {isStudent && <CanteenBackdrop canteen={currentCanteen} />}
      <Sidebar />
      <main
        className={`main ${isStudent && currentCanteen ? "canteen-themed" : ""}`}
        style={isStudent && currentCanteen ? brandingStyle(currentCanteen) : undefined}
      >
        <Header search={search} onSearchChange={setSearch} />
        <Outlet context={{ search }} />
      </main>
    </div>
  );
}
