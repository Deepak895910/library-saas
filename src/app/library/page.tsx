"use client";

import { useMemo, useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Shift = "Morning" | "Evening" | "Full Day";
type Status = "Paid" | "Due Today" | "Overdue";
type Filter = "all" | "due" | "overdue" | "paid";

type Student = {
  id: string;
  seatNo: string;
  name: string;
  phone: string;
  shift: Shift;
  monthlyFee: number;
  dueDate: string;
  status: Status;
};

type LibraryInfo = {
  id: string;
  name: string;
  owner_name: string;
  phone: string;
  plan_status: string;
  expiry_date: string;
};

const SUPER_ADMIN_WHATSAPP = "919876543210";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function shiftBadge(shift: Shift) {
  if (shift === "Morning") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  if (shift === "Evening") return "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200";
  return "bg-violet-50 text-violet-700 ring-1 ring-violet-200";
}

function statusBadge(status: Status) {
  if (status === "Paid") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (status === "Overdue") return "bg-red-50 text-red-700 ring-1 ring-red-200";
  return "bg-orange-50 text-orange-700 ring-1 ring-orange-200";
}

const SEAT_COLLATOR = { numeric: true, sensitivity: "base" } as const;

function LibraryView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const libId = searchParams.get("id");

  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [currentLib, setCurrentLib] = useState<LibraryInfo | null>(null);
  const [isLibraryActive, setIsLibraryActive] = useState<boolean | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const [form, setForm] = useState({
    seatNo: "",
    name: "",
    phone: "",
    shift: "Morning" as Shift,
    monthlyFee: "900",
    dueDate: "29 Sep 2026",
    status: "Due Today" as Status,
  });

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("active_library_id");
      localStorage.removeItem("active_library_id");
    }
    router.replace("/");
  };

  // 1. Pehle Session verify karein
  useEffect(() => {
    if (!libId) {
      router.replace("/");
      return;
    }

    const sessionLibId = sessionStorage.getItem("active_library_id") || localStorage.getItem("active_library_id");

    if (!sessionLibId || sessionLibId.trim() !== libId.trim()) {
      router.replace("/");
      return;
    }

    setIsAuthorized(true);
  }, [libId, router]);

  // 2. Data tabhi load karein jab verify ho jaye
  const loadData = async () => {
    if (!libId) return;

    setLoading(true);

    const { data: libData, error: libErr } = await supabase
      .from("libraries")
      .select("*")
      .eq("id", libId)
      .maybeSingle();

    if (libErr || !libData) {
      router.replace("/");
      return;
    }

    const selected = libData as LibraryInfo;
    setCurrentLib(selected);

    const isDateExpired = selected.expiry_date 
      ? new Date(selected.expiry_date).getTime() < new Date().setHours(0, 0, 0, 0)
      : false;

    if (selected.plan_status === "inactive" || isDateExpired) {
      setIsLibraryActive(false);
      setLoading(false);
      return;
    }

    setIsLibraryActive(true);

    const { data: stuData } = await supabase
      .from("students")
      .select("*")
      .eq("library_id", selected.id)
      .order("created_at", { ascending: false });

    if (stuData) {
      const formatted: Student[] = stuData.map((item: any) => ({
        id: item.id,
        seatNo: item.seat_no,
        name: item.name,
        phone: item.phone,
        shift: item.shift as Shift,
        monthlyFee: Number(item.monthly_fee),
        dueDate: item.due_date,
        status:
          item.status === "paid"
            ? "Paid"
            : item.status === "overdue"
            ? "Overdue"
            : "Due Today",
      }));
      setStudents(formatted);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAuthorized) {
      loadData();
    }
  }, [isAuthorized, libId]);

  const dueToday = students.filter((s) => s.status === "Due Today");
  const overdue = students.filter((s) => s.status === "Overdue");
  const paid = students.filter((s) => s.status === "Paid");
  const dueTodayAmount = dueToday.reduce((sum, s) => sum + s.monthlyFee, 0);
  const monthRevenue = paid.reduce((sum, s) => sum + s.monthlyFee, 0);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: `All Students (${students.length})` },
    { id: "due", label: `Due Today (${dueToday.length})` },
    { id: "overdue", label: `Overdue (${overdue.length})` },
    { id: "paid", label: `Paid (${paid.length})` },
  ];

  const filtered = useMemo(() => {
    const byStatus =
      filter === "due"
        ? dueToday
        : filter === "overdue"
          ? overdue
          : filter === "paid"
            ? paid
            : students;

    const q = query.trim().toLowerCase();
    const matched = !q
      ? byStatus
      : byStatus.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.seatNo.toLowerCase().includes(q) ||
            s.phone.includes(q)
        );

    return [...matched].sort((a, b) =>
      a.seatNo.localeCompare(b.seatNo, undefined, SEAT_COLLATOR)
    );
  }, [dueToday, filter, overdue, paid, query, students]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }

  function reminderText(student: Student) {
    const libName = currentLib?.name || "Library";
    const owner = currentLib?.owner_name || "Owner";
    return `Namaste ${student.name},\n\nThis is a reminder from ${libName}. Your seat ${student.seatNo} monthly fee of ${formatINR(student.monthlyFee)} is ${student.status === "Overdue" ? "overdue" : "due today"} (due date: ${student.dueDate}).\n\nPlease complete the payment at your earliest convenience.\n\nThank you,\n${owner}\n${libName}`;
  }

  function openWhatsApp(student: Student) {
    const url = `https://wa.me/91${student.phone}?text=${encodeURIComponent(reminderText(student))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleOpenAdd() {
    setEditingId(null);
    setForm({
      seatNo: "",
      name: "",
      phone: "",
      shift: "Morning",
      monthlyFee: "900",
      dueDate: "29 Sep 2026",
      status: "Due Today",
    });
    setFormError("");
    setShowModal(true);
  }

  function handleOpenEdit(student: Student) {
    setEditingId(student.id);
    setForm({
      seatNo: student.seatNo,
      name: student.name,
      phone: student.phone,
      shift: student.shift,
      monthlyFee: String(student.monthlyFee),
      dueDate: student.dueDate,
      status: student.status,
    });
    setFormError("");
    setShowModal(true);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Kya aap ${name} ka record hatana chahte hain?`)) return;

    const { error } = await supabase.from("students").delete().eq("id", id);
    if (!error) {
      setStudents((prev) => prev.filter((s) => s.id !== id));
      showToast(`${name} ka record hata diya gaya.`);
    }
  }

  async function markPaid(id: string) {
    const { error } = await supabase
      .from("students")
      .update({ status: "paid" })
      .eq("id", id);

    if (!error) {
      setStudents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "Paid" as const } : s))
      );
      showToast("Payment marked as received.");
    }
  }

  async function handleSaveStudent(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");

    const seatNo = form.seatNo.trim().toUpperCase();
    const fee = Number(form.monthlyFee) || 900;

    const isBooked = students.some(
      (s) =>
        s.id !== editingId &&
        s.seatNo.toUpperCase() === seatNo &&
        (s.shift === form.shift || s.shift === "Full Day" || form.shift === "Full Day")
    );

    if (isBooked) {
      setFormError(`Seat ${seatNo} pehle se booked hai!`);
      return;
    }

    const payload: any = {
      name: form.name.trim(),
      phone: form.phone.replace(/\D/g, "").slice(-10),
      seat_no: seatNo,
      shift: form.shift,
      monthly_fee: fee,
      due_date: form.dueDate,
      status:
        form.status === "Paid"
          ? "paid"
          : form.status === "Overdue"
          ? "overdue"
          : "due_today",
      library_id: currentLib?.id,
    };

    if (editingId) {
      const { error } = await supabase
        .from("students")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        setFormError(error.message);
        return;
      }

      setStudents((prev) =>
        prev.map((s) =>
          s.id === editingId
            ? {
                ...s,
                seatNo,
                name: payload.name,
                phone: payload.phone,
                shift: form.shift,
                monthlyFee: fee,
                dueDate: form.dueDate,
                status: form.status,
              }
            : s
        )
      );
      showToast(`${payload.name} ka data update ho gaya!`);
    } else {
      const { data, error } = await supabase
        .from("students")
        .insert([payload])
        .select();

      if (error) {
        setFormError(error.message);
        return;
      }

      if (data && data.length > 0) {
        const added = data[0];
        setStudents((prev) => [
          ...prev,
          {
            id: added.id,
            seatNo: added.seat_no,
            name: added.name,
            phone: added.phone,
            shift: added.shift as Shift,
            monthlyFee: Number(added.monthly_fee),
            dueDate: added.due_date,
            status: form.status,
          },
        ]);
        showToast(`${payload.name} ko seat ${seatNo} par jod diya.`);
      }
    }

    setShowModal(false);
  }

  // Jab tak auth verify ho raha ho
  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-sm">
        Verifying Session Access...
      </div>
    );
  }

  if (isLibraryActive === false) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-slate-800 border border-rose-500/30 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-3xl">
            🔒
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Account Deactivated / Expired</h2>
            <p className="text-slate-400 text-sm mt-2">
              <strong className="text-white">{currentLib?.name || "Library"}</strong> ka subscription plan abhi inactive ya expired hai.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <a
              href={`https://wa.me/${SUPER_ADMIN_WHATSAPP}?text=${encodeURIComponent(
                `Namaste Admin, meri library (${currentLib?.name || "Library"}) ka account expired/deactivated hai.`
              )}`}
              target="_blank"
              className="w-full inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl transition text-sm"
            >
              Contact Admin on WhatsApp
            </a>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 text-xs text-slate-400 hover:text-white"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/30">
              {currentLib?.name ? currentLib.name.slice(0, 3).toUpperCase() : "LIB"}
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight text-slate-900">
                {currentLib?.name || "Library"}
              </p>
              <p className="text-sm text-slate-500">Owner · {currentLib?.owner_name || "Manager"}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-2 rounded-xl transition"
            >
              Logout ↩
            </button>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700"
            >
              <span className="text-lg leading-none">+</span>
              Add Student
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {currentLib?.name} Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage students, dues and seat allocations for your branch.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Total Enrolled Students</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{students.length}</p>
          </article>
          <article className="rounded-2xl border border-orange-100 bg-gradient-to-br from-white to-orange-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-orange-700">Fees Due Today</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-orange-800">{formatINR(dueTodayAmount)}</p>
            <p className="mt-2 text-sm text-orange-700/80">{dueToday.length} Students</p>
          </article>
          <article className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 p-5 shadow-sm sm:col-span-2 xl:col-span-1">
            <p className="text-sm font-medium text-emerald-700">Total Revenue This Month</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-emerald-800">{formatINR(monthRevenue)}</p>
            <p className="mt-2 text-sm text-emerald-700/80">From {paid.length} paid seats</p>
          </article>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    filter === item.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, seat, or phone"
              className="w-full sm:max-w-xs rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-blue-500/30 focus:bg-white focus:ring-2"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Seat No</th>
                  <th className="px-5 py-3 font-medium">Student Name</th>
                  <th className="px-5 py-3 font-medium">Phone Number</th>
                  <th className="px-5 py-3 font-medium">Shift</th>
                  <th className="px-5 py-3 font-medium">Monthly Fee</th>
                  <th className="px-5 py-3 font-medium">Due Date</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">Loading data...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">Is library me abhi koi student nahi hai.</td>
                  </tr>
                ) : (
                  filtered.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3">
                        <span className="inline-flex min-w-[3.25rem] items-center justify-center rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                          {student.seatNo}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">{student.name}</td>
                      <td className="px-5 py-3 tabular-nums text-slate-600">{student.phone}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${shiftBadge(student.shift)}`}>
                          {student.shift}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium">{formatINR(student.monthlyFee)}</td>
                      <td className="px-5 py-3 text-slate-600">{student.dueDate}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(student.status)}`}>
                          {student.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openWhatsApp(student)}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            WA
                          </button>
                          {student.status !== "Paid" && (
                            <button
                              type="button"
                              onClick={() => markPaid(student.id)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
                            >
                              Paid
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(student)}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(student.id, student.name)}
                            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {showModal && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <form onSubmit={handleSaveStudent} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">{editingId ? "Edit Student Details" : "Add New Student"}</h2>
            {formError && <div className="mt-2 text-xs text-red-600 font-medium">⚠️ {formError}</div>}
            <div className="mt-4 grid gap-3">
              <input
                required
                placeholder="Seat No (A01)"
                value={form.seatNo}
                onChange={(e) => setForm({ ...form, seatNo: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
              <input
                required
                placeholder="Student Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
              <input
                required
                placeholder="Phone (10 digits)"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.shift}
                  onChange={(e) => setForm({ ...form, shift: e.target.value as Shift })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option>Morning</option>
                  <option>Evening</option>
                  <option>Full Day</option>
                </select>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option>Due Today</option>
                  <option>Overdue</option>
                  <option>Paid</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  type="number"
                  placeholder="Monthly Fee"
                  value={form.monthlyFee}
                  onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  required
                  placeholder="Due Date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl px-4 py-2 text-sm text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-40 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading library...</div>}>
      <LibraryView />
    </Suspense>
  );
}