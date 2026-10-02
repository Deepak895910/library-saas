"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"library" | "admin">("library");

  // Library Owner Form State
  const [phone, setPhone] = useState("");
  const [libPassword, setLibPassword] = useState("");

  // Super Admin Form State
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPin, setAdminPin] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 🟢 AGAR USER PEHLE SE LOGGED-IN HAI, TOH DIRECT DASHBOARD PAR BHEJO
  useEffect(() => {
    if (typeof window !== "undefined") {
      const activeLibId = localStorage.getItem("active_library_id");
      const authToken = localStorage.getItem("auth_token");
      if (activeLibId && authToken === `auth_verified_${activeLibId}`) {
        router.replace(`/library?id=${activeLibId}`);
      }
    }
  }, [router]);

  // 1. Library Owner Login (Database `libraries` table se check hoga)
  const handleLibraryLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    const cleanPhone = phone.replace(/\D/g, "").slice(-10);

    const { data, error } = await supabase
      .from("libraries")
      .select("id, name, phone, password, plan_status, expiry_date")
      .eq("phone", cleanPhone)
      .maybeSingle();

    if (error || !data) {
      setLoading(false);
      setErrorMsg("Yeh phone number kisi registered library se match nahi hua.");
      return;
    }

    if (data.password !== libPassword) {
      setLoading(false);
      setErrorMsg("Galat library password! Kripya dobara check karein.");
      return;
    }

    // 👉 COOKIE + LOCALSTORAGE + SECURE AUTH TOKEN SET KAREIN
    if (typeof window !== "undefined") {
      document.cookie = `active_library_id=${data.id}; path=/; max-age=2592000; SameSite=Lax`;
      sessionStorage.setItem("active_library_id", data.id);
      localStorage.setItem("active_library_id", data.id);
      localStorage.setItem("auth_token", `auth_verified_${data.id}`);
    }

    setLoading(false);
    // router.replace use kiya taaki browser history mein login page na bache
    router.replace(`/library?id=${data.id}`);
  };

  // 2. Super Admin Login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    const { data, error } = await supabase
      .from("admin_users")
      .select("username, password")
      .eq("username", adminUsername.trim())
      .maybeSingle();

    if (error || !data) {
      setLoading(false);
      setErrorMsg("Database se admin record nahi mila.");
      return;
    }

    if (data.password !== adminPin.trim()) {
      setLoading(false);
      setErrorMsg("Galat Admin Password! Database wala naya password dalein.");
      return;
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem("admin_authenticated", "true");
    }

    setLoading(false);
    router.replace("/admin");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="max-w-md w-full space-y-6">
        
        {/* Top Branding Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-lg shadow-indigo-600/30">
            📖
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Library Cloud Portal
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Login karne ke liye apna portal chunein
          </p>
        </div>

        {/* Login Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          
          {/* Tab Selector */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => { setActiveTab("library"); setErrorMsg(""); }}
              className={`py-2 text-xs sm:text-sm font-semibold rounded-xl transition ${
                activeTab === "library"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Library Owner
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("admin"); setErrorMsg(""); }}
              className={`py-2 text-xs sm:text-sm font-semibold rounded-xl transition ${
                activeTab === "admin"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Super Admin
            </button>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center font-medium">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Library Owner Login Form */}
          {activeTab === "library" ? (
            <form onSubmit={handleLibraryLogin} className="space-y-4">
              <div>
                <label className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Registered Phone Number
                </label>
                <input
                  required
                  type="tel"
                  maxLength={10}
                  placeholder="e.g. 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full mt-1.5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm outline-none focus:border-blue-500 transition font-mono"
                />
              </div>

              <div>
                <label className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Library Password
                </label>
                <input
                  required
                  type="password"
                  placeholder="Enter library password"
                  value={libPassword}
                  onChange={(e) => setLibPassword(e.target.value)}
                  className="w-full mt-1.5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm outline-none focus:border-blue-500 transition font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-blue-600/25 text-sm"
              >
                {loading ? "Checking Database..." : "Login to Library Dashboard →"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Admin Username
                </label>
                <input
                  required
                  type="text"
                  placeholder="admin"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="w-full mt-1.5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm outline-none focus:border-indigo-500 transition font-mono"
                />
              </div>

              <div>
                <label className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Admin Password
                </label>
                <input
                  required
                  type="password"
                  placeholder="Enter database password"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  className="w-full mt-1.5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm outline-none focus:border-indigo-500 transition font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-indigo-600/25 text-sm"
              >
                {loading ? "Verifying with Database..." : "Unlock Super Admin Panel ⚙"}
              </button>
            </form>
          )}

        </div>

        <p className="text-center text-xs text-slate-500">
          Apex SaaS Platform · 100% Database-Driven Authentication
        </p>

      </div>
    </div>
  );
}