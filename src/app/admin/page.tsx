"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface Library {
  id: string;
  name: string;
  owner_name: string;
  phone: string;
  city: string;
  plan_status: "active" | "inactive";
  total_seats: number;
  monthly_charge: number;
  expiry_date: string;
  password?: string;
}

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    owner_name: "",
    phone: "",
    password: "",
    city: "",
    total_seats: 50,
    monthly_charge: 499,
    plan_months: 1,
    expiry_date: "",
  });

  // Direct Link Protection: Agar admin login nahi hai toh homepage par fek do
  useEffect(() => {
    const cookieAuth = getCookie("admin_authenticated");
    const sessionAuth = sessionStorage.getItem("admin_authenticated") || localStorage.getItem("admin_authenticated");

    if (cookieAuth !== "true" && sessionAuth !== "true") {
      router.replace("/");
      return;
    }

    setIsAuthorized(true);
  }, [router]);

  const handleAdminLogout = () => {
    if (typeof window !== "undefined") {
      document.cookie = "admin_authenticated=; path=/; max-age=0";
      sessionStorage.removeItem("admin_authenticated");
      localStorage.removeItem("admin_authenticated");
    }
    router.replace("/");
  };

  const fetchLibraries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("libraries")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setLibraries(data as Library[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchLibraries();
    }
  }, [isAuthorized]);

  const getDaysLeft = (expiryDate: string) => {
    if (!expiryDate) return 0;
    const diff = new Date(expiryDate).getTime() - new Date().setHours(0, 0, 0, 0);
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({
      name: "",
      owner_name: "",
      phone: "",
      password: "",
      city: "",
      total_seats: 50,
      monthly_charge: 499,
      plan_months: 1,
      expiry_date: "",
    });
    setShowModal(true);
  };

  const handleOpenEdit = (lib: Library) => {
    setEditingId(lib.id);
    setForm({
      name: lib.name,
      owner_name: lib.owner_name,
      phone: lib.phone,
      password: lib.password || "123456",
      city: lib.city,
      total_seats: lib.total_seats,
      monthly_charge: lib.monthly_charge,
      plan_months: 1,
      expiry_date: lib.expiry_date || "",
    });
    setShowModal(true);
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "inactive" : "active";
    const { error } = await supabase
      .from("libraries")
      .update({ plan_status: nextStatus })
      .eq("id", id);

    if (!error) {
      setLibraries((prev) =>
        prev.map((lib) => (lib.id === id ? { ...lib, plan_status: nextStatus as any } : lib))
      );
    }
  };

  const handleRenewOneMonth = async (id: string, currentExpiry: string) => {
    const base = new Date(currentExpiry && new Date(currentExpiry) > new Date() ? currentExpiry : new Date());
    base.setMonth(base.getMonth() + 1);
    const newDate = base.toISOString().split("T")[0];

    const { error } = await supabase
      .from("libraries")
      .update({ expiry_date: newDate, plan_status: "active" })
      .eq("id", id);

    if (!error) {
      setLibraries((prev) =>
        prev.map((lib) => (lib.id === id ? { ...lib, expiry_date: newDate, plan_status: "active" } : lib))
      );
    }
  };

  const handleSaveLibrary = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = form.phone.replace(/\D/g, "").slice(-10);

    if (editingId) {
      const payload: any = {
        name: form.name.trim(),
        owner_name: form.owner_name.trim(),
        phone: cleanPhone,
        password: form.password.trim(),
        city: form.city.trim(),
        total_seats: Number(form.total_seats),
        monthly_charge: Number(form.monthly_charge),
      };

      if (form.expiry_date) {
        payload.expiry_date = form.expiry_date;
      }

      const { error } = await supabase
        .from("libraries")
        .update(payload)
        .eq("id", editingId);

      if (!error) {
        setLibraries((prev) =>
          prev.map((lib) => (lib.id === editingId ? { ...lib, ...payload } : lib))
        );
        setShowModal(false);
      } else {
        alert("Update failed: " + error.message);
      }
    } else {
      const exp = new Date();
      exp.setMonth(exp.getMonth() + Number(form.plan_months));
      const expiry_date = exp.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("libraries")
        .insert([
          {
            name: form.name.trim(),
            owner_name: form.owner_name.trim(),
            phone: cleanPhone,
            password: form.password.trim() || "123456",
            city: form.city.trim(),
            total_seats: Number(form.total_seats),
            monthly_charge: Number(form.monthly_charge),
            plan_status: "active",
            expiry_date,
          },
        ])
        .select();

      if (!error && data) {
        setLibraries([data[0] as Library, ...libraries]);
        setShowModal(false);
      } else if (error) {
        alert("Error adding library: " + error.message);
      }
    }
  };

  // Jab tak admin check chal raha ho
  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Verifying Admin Access...
      </div>
    );
  }

  const activeCount = libraries.filter(
    (l) => l.plan_status === "active" && getDaysLeft(l.expiry_date) > 0
  ).length;

  const totalMRR = libraries
    .filter((l) => l.plan_status === "active" && getDaysLeft(l.expiry_date) > 0)
    .reduce((sum, l) => sum + Number(l.monthly_charge), 0);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-800/80 border border-slate-700 p-6 rounded-2xl gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="bg-indigo-600 text-white font-black px-2.5 py-1 rounded-lg text-xs uppercase tracking-wider">
                Super Admin
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-white">SaaS Client Control</h1>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Libraries manage karein, details edit karein aur expiry handle karein.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdminLogout}
              className="text-xs bg-slate-700 hover:bg-rose-900/60 text-slate-200 hover:text-rose-200 font-semibold px-4 py-2.5 rounded-xl transition flex items-center"
            >
              Lock / Logout ↩
            </button>
            <button
              onClick={handleOpenAdd}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/30"
            >
              + Onboard New Library
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-2xl">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Clients</span>
            <p className="text-3xl font-extrabold text-white mt-2">{libraries.length}</p>
          </div>
          <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-2xl">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Valid Subscriptions</span>
            <p className="text-3xl font-extrabold text-emerald-400 mt-2">{activeCount}</p>
          </div>
          <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-2xl">
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Active MRR</span>
            <p className="text-3xl font-extrabold text-indigo-400 mt-2">₹{totalMRR}</p>
          </div>
        </div>

        {/* Libraries Table */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-base font-semibold text-white">Registered Libraries</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/60 text-xs font-semibold uppercase text-slate-400">
                <tr>
                  <th className="py-4 px-6">Library Details</th>
                  <th className="py-4 px-6">Owner & Login Phone</th>
                  <th className="py-4 px-6">Login Password</th>
                  <th className="py-4 px-6">Validity</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-center">Dashboard</th>
                  <th className="py-4 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">Loading libraries...</td>
                  </tr>
                ) : libraries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">No libraries found.</td>
                  </tr>
                ) : (
                  libraries.map((lib) => {
                    const days = getDaysLeft(lib.expiry_date);
                    const isExpired = days <= 0;
                    const isFullyActive = lib.plan_status === "active" && !isExpired;

                    return (
                      <tr key={lib.id} className="hover:bg-slate-700/30 transition">
                        <td className="py-4 px-6">
                          <p className="font-semibold text-white">{lib.name}</p>
                          <p className="text-xs text-slate-400">{lib.city} · {lib.total_seats} Seats</p>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-white font-medium">{lib.owner_name}</p>
                          <p className="text-xs text-indigo-400 font-mono">📱 {lib.phone}</p>
                        </td>
                        <td className="py-4 px-6">
                          <span className="bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-xs font-mono text-emerald-400">
                            🔑 {lib.password || "123456"}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-mono text-xs">
                          {isExpired ? (
                            <span className="text-rose-400">Expired ({lib.expiry_date})</span>
                          ) : (
                            <span className="text-slate-300">{days}d left ({lib.expiry_date})</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                              isFullyActive
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : "bg-rose-950 text-rose-400 border border-rose-800"
                            }`}
                          >
                            {isFullyActive ? "ACTIVE" : "LOCKED"}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <a
                            href={`/library?id=${lib.id}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg transition"
                          >
                            Open ↗
                          </a>
                        </td>
                        <td className="py-4 px-6 text-center space-x-1.5">
                          <button
                            onClick={() => handleOpenEdit(lib)}
                            className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium px-2.5 py-1.5 rounded-lg transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRenewOneMonth(lib.id, lib.expiry_date)}
                            className="text-xs bg-slate-700 hover:bg-slate-600 text-white font-medium px-2.5 py-1.5 rounded-lg transition"
                          >
                            +1 Mo
                          </button>
                          <button
                            onClick={() => handleToggleStatus(lib.id, lib.plan_status)}
                            className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition ${
                              lib.plan_status === "active"
                                ? "bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800"
                                : "bg-emerald-900 hover:bg-emerald-800 text-emerald-200"
                            }`}
                          >
                            {lib.plan_status === "active" ? "Block" : "Unblock"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Add OR Edit Library */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4">
              <h3 className="text-lg font-bold text-white">
                {editingId ? "Edit Library Details" : "Onboard New Library"}
              </h3>
              <form onSubmit={handleSaveLibrary} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 uppercase font-semibold">Library Name</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Saraswati Library"
                    className="w-full mt-1 p-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase font-semibold">Owner Name</label>
                  <input
                    required
                    value={form.owner_name}
                    onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                    placeholder="e.g. Amit Patel"
                    className="w-full mt-1 p-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-indigo-400 uppercase font-semibold">Login Phone</label>
                    <input
                      required
                      type="tel"
                      maxLength={10}
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="10 digit number"
                      className="w-full mt-1 p-2 rounded-xl bg-slate-900 border border-indigo-500/50 text-white text-sm outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-emerald-400 uppercase font-semibold">Login Password</label>
                    <input
                      required
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="e.g. 123456"
                      className="w-full mt-1 p-2 rounded-xl bg-slate-900 border border-emerald-500/50 text-white text-sm outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 uppercase font-semibold">City</label>
                    <input
                      required
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder="e.g. Sagar"
                      className="w-full mt-1 p-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase font-semibold">Seats Capacity</label>
                    <input
                      type="number"
                      required
                      value={form.total_seats}
                      onChange={(e) => setForm({ ...form, total_seats: Number(e.target.value) })}
                      className="w-full mt-1 p-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 uppercase font-semibold">
                      {editingId ? "Expiry Date (YYYY-MM-DD)" : "Validity Plan"}
                    </label>
                    {editingId ? (
                      <input
                        type="date"
                        value={form.expiry_date}
                        onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                        className="w-full mt-1 p-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500 font-mono"
                      />
                    ) : (
                      <select
                        value={form.plan_months}
                        onChange={(e) => setForm({ ...form, plan_months: Number(e.target.value) })}
                        className="w-full mt-1 p-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500"
                      >
                        <option value={1}>1 Month</option>
                        <option value={3}>3 Months</option>
                        <option value={6}>6 Months</option>
                        <option value={12}>1 Year</option>
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase font-semibold">Monthly Charge (₹)</label>
                    <input
                      type="number"
                      required
                      value={form.monthly_charge}
                      onChange={(e) => setForm({ ...form, monthly_charge: Number(e.target.value) })}
                      className="w-full mt-1 p-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 text-sm font-semibold rounded-xl transition"
                  >
                    {editingId ? "Update Library" : "Save & Generate Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}