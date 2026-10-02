"use client";

import { useMemo, useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import jsPDF from "jspdf";

type Shift = "Morning" | "Evening" | "Full Day" | "Random";
type Status = "Paid" | "Due Today" | "Overdue" | "Left";
type Filter = "all" | "due" | "overdue" | "paid" | "left";
type PaymentMode = "Cash" | "UPI/Online";

type Student = {
  id: string;
  seatNo: string;
  name: string;
  phone: string;
  shift: Shift;
  monthlyFee: number;
  joiningDate: string;
  lastPaidDate: string | null;
  lastPaymentMode?: string | null;
  dueDate: string;
  status: Status;
  pendingMonths: number;
};

type Inquiry = {
  id: string;
  name: string;
  phone: string;
  interested_shift: Shift;
  notes: string;
  status: "pending" | "admitted" | "closed";
  created_at: string;
};

type PaymentRecord = {
  id: string;
  amount_paid: number;
  months_count: number;
  payment_mode: string;
  payment_date: string;
  paid_until_date: string | null;
  created_at: string;
};

type LibraryInfo = {
  id: string;
  name: string;
  owner_name: string;
  phone: string;
  plan_status: string;
  expiry_date: string;
  seats_config?: string;
  logo_url?: string;
};

const SUPER_ADMIN_WHATSAPP = "919301530783";

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function shiftBadge(shift: Shift) {
  if (shift === "Morning") return "bg-amber-100 text-amber-900 border border-amber-300 font-bold";
  if (shift === "Evening") return "bg-blue-100 text-blue-900 border border-blue-300 font-bold";
  if (shift === "Full Day") return "bg-purple-100 text-purple-900 border border-purple-300 font-bold";
  return "bg-rose-100 text-rose-900 border border-rose-300 font-bold";
}

function statusBadge(status: Status) {
  if (status === "Paid") return "bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold";
  if (status === "Overdue") return "bg-rose-100 text-rose-800 border border-rose-300 font-bold";
  if (status === "Left") return "bg-slate-100 text-slate-600 border border-slate-300 font-bold";
  return "bg-amber-100 text-amber-800 border border-amber-300 font-bold";
}

const SEAT_COLLATOR = { numeric: true, sensitivity: "base" } as const;

function parseCustomSeats(input: string): string[] {
  const parts = input.split(",").map((p) => p.trim()).filter(Boolean);
  const result: string[] = [];

  parts.forEach((part) => {
    const match = part.match(/^([A-Za-z_-]*)(\d+)\s*-\s*([A-Za-z_-]*)(\d+)$/);
    if (match) {
      const prefix1 = match[1] || "";
      const start = parseInt(match[2], 10);
      const prefix2 = match[3] || prefix1;
      const end = parseInt(match[4], 10);

      const prefix = prefix1 || prefix2;
      const min = Math.min(start, end);
      const max = Math.max(start, end);

      for (let i = min; i <= max; i++) {
        result.push(`${prefix}${i}`);
      }
    } else {
      result.push(part);
    }
  });

  return Array.from(new Set(result));
}

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function downloadReceiptPDF(
  libName: string,
  ownerName: string,
  ownerPhone: string,
  student: Student,
  amount: number,
  months: number,
  mode: string,
  paymentDateStr: string = getLocalDateString()
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const receiptNo = `LIB-${Date.now().toString().slice(-6)}`;
  const dateStr = formatDate(paymentDateStr);

  const nextDue = new Date(paymentDateStr);
  nextDue.setMonth(nextDue.getMonth() + months);
  const validTill = nextDue.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.8);
  doc.rect(8, 8, 132, 194, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text((libName || "LIBRARY MANAGEMENT").toUpperCase(), 74, 22, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Contact: +91 ${ownerPhone || "9301530783"}`, 74, 28, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text("FEE PAYMENT RECEIPT", 74, 35, { align: "center" });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 39, 134, 39);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Receipt No: ${receiptNo}`, 14, 46);
  doc.text(`Payment Date: ${dateStr}`, 14, 52);
  doc.text(`Status: PAID & VERIFIED`, 134, 46, { align: "right" });
  doc.text(`Payment Mode: ${mode}`, 134, 52, { align: "right" });

  doc.setFillColor(248, 250, 252);
  doc.rect(14, 57, 120, 26, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(14, 57, 120, 26, "S");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`Student: ${student.name}`, 18, 64);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(`Phone: +91 ${student.phone}`, 18, 70);
  doc.text(`Shift: ${student.shift} Shift`, 18, 76);

  const seatLabel = student.shift === "Random" ? "Floating Seat" : `Seat No: ${student.seatNo}`;
  doc.setFont("helvetica", "bold");
  doc.text(seatLabel, 130, 64, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 65, 85);
  doc.text("Description", 14, 93);
  doc.text("Duration", 80, 93);
  doc.text("Amount", 134, 93, { align: "right" });
  doc.line(14, 96, 134, 96);

  doc.setFont("helvetica", "normal");
  doc.text("Library Seat Monthly Fee", 14, 104);
  doc.text(`${months} Month(s)`, 80, 104);
  doc.setFont("helvetica", "bold");
  doc.text(`INR ${amount}`, 134, 104, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Valid Till: ${validTill}`, 14, 110);

  doc.setFillColor(241, 245, 249);
  doc.rect(14, 120, 120, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Total Amount Paid:", 18, 129);
  doc.setTextColor(4, 120, 87);
  doc.text(`INR ${amount}`, 130, 129, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("* Fee once paid is non-refundable.", 14, 150);
  doc.text("* Maintain discipline inside library premises.", 14, 155);

  doc.line(90, 172, 132, 172);
  doc.setFontSize(8);
  doc.text("Authorized Signatory", 111, 177, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(ownerName || "Manager", 111, 182, { align: "center" });

  doc.save(`${student.name.replace(/\s+/g, "_")}_Fee_Receipt.pdf`);
}

function calculateMonthlyDue(
  joiningDateStr: string,
  lastPaidDateStr: string | null,
  rawStatus?: string
): { dueDateText: string; status: Status; pendingMonths: number } {
  if (rawStatus === "left") {
    return { dueDateText: "-", status: "Left", pendingMonths: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const jParts = (joiningDateStr || getLocalDateString()).split("-").map(Number);
  const joinDay = jParts[2] || 1;
  const joinDate = new Date(jParts[0], jParts[1] - 1, joinDay);
  joinDate.setHours(0, 0, 0, 0);

  if (!lastPaidDateStr) {
    const dueDateText = joinDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return {
      dueDateText,
      status: "Due Today",
      pendingMonths: 1,
    };
  }

  const baseDate = new Date(lastPaidDateStr);
  baseDate.setHours(0, 0, 0, 0);

  const targetDue = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
  const maxDaysInTargetMonth = new Date(targetDue.getFullYear(), targetDue.getMonth() + 1, 0).getDate();
  targetDue.setDate(Math.min(joinDay, maxDaysInTargetMonth));
  targetDue.setHours(0, 0, 0, 0);

  const dueDateText = targetDue.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const diffTime = today.getTime() - targetDue.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 30) {
    const monthDiff = Math.max(2, Math.floor(diffDays / 30) + 1);
    return { dueDateText, status: "Overdue", pendingMonths: monthDiff };
  } else if (diffDays >= 0) {
    return { dueDateText, status: diffDays === 0 ? "Due Today" : "Overdue", pendingMonths: 1 };
  } else {
    return { dueDateText, status: "Paid", pendingMonths: 0 };
  }
}

function LibraryView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const libId = searchParams.get("id");

  const [activeTab, setActiveTab] = useState<"students" | "seats" | "inquiries">("students");
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [currentLib, setCurrentLib] = useState<LibraryInfo | null>(null);
  const [isLibraryActive, setIsLibraryActive] = useState<boolean | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [savingStudent, setSavingStudent] = useState(false);
  const [rejoiningStudent, setRejoiningStudent] = useState<Student | null>(null);

  const [allSeatNames, setAllSeatNames] = useState<string[]>([]);
  const [seatConfigInput, setSeatConfigInput] = useState("A1-A25, B1-B25");
  const [showVacantModal, setShowVacantModal] = useState(false);
  const [seatShiftView, setSeatShiftView] = useState<Shift | "All">("Morning");
  const [vacantShiftFilter, setVacantShiftFilter] = useState<Shift | "All">("All");

  const [collectStudent, setCollectStudent] = useState<Student | null>(null);
  const [collectMonths, setCollectMonths] = useState<number>(1);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");
  const [collectCustomDate, setCollectCustomDate] = useState<string>(getLocalDateString());

  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({
    name: "",
    phone: "",
    shift: "Morning" as Shift,
    notes: "",
  });
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState(
    "Namaste! Hamari library me special admission discount aur peaceful environment available hai. Aaj hi visit karein aur apni seat book karein!"
  );

  const [paymentSuccessData, setPaymentSuccessData] = useState<{
    student: Student;
    amount: number;
    months: number;
    mode: string;
    waUrl: string;
    paymentDate: string;
  } | null>(null);

  const todayStr = getLocalDateString();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    seatNo: "",
    name: "",
    phone: "",
    shift: "Morning" as Shift,
    monthlyFee: "900",
    joiningDate: todayStr,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const onOn = () => setIsOnline(true);
      const onOff = () => setIsOnline(false);
      window.addEventListener("online", onOn);
      window.addEventListener("offline", onOff);

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }

      return () => {
        window.removeEventListener("online", onOn);
        window.removeEventListener("offline", onOff);
      };
    }
  }, []);

  const checkOnlineStatus = (): boolean => {
    if (typeof window !== "undefined" && !navigator.onLine) {
      alert("⚠️ Internet band hai! Naya admission lene ya fees collect karne ke liye kripya internet on karein.");
      return false;
    }
    return true;
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("active_library_id");
      localStorage.removeItem("active_library_id");
    }
    router.replace("/");
  };

  // 🟢 ANTI-LOGOUT ON BROWSER BACK NAVIGATION FIX
  useEffect(() => {
    const activeId = libId || (typeof window !== "undefined" ? localStorage.getItem("active_library_id") : null);

    if (!activeId) {
      router.replace("/");
      return;
    }

    if (!libId && activeId) {
      router.replace(`/library?id=${activeId}`);
      return;
    }

    localStorage.setItem("active_library_id", activeId);
    setIsAuthorized(true);
  }, [libId, router]);

  // 🟢 ZERO-FREEZE INSTANT CACHE & 3.5s NETWORK TIMEOUT
  const loadData = async () => {
    const targetId = libId || (typeof window !== "undefined" ? localStorage.getItem("active_library_id") : null);
    if (!targetId) return;

    const cacheKey = `lib_full_cache_${targetId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.currentLib) {
          setCurrentLib(parsed.currentLib);
          const savedConfig = parsed.currentLib.seats_config || "A1-A25, B1-B25";
          setSeatConfigInput(savedConfig);
          setAllSeatNames(parseCustomSeats(savedConfig));
          setIsLibraryActive(parsed.currentLib.plan_status !== "inactive");
        }
        setStudents(parsed.students || []);
        setInquiries(parsed.inquiries || []);
        setLoading(false);
      } catch (e) {
        console.error("Cache read failed", e);
      }
    }

    if (typeof window !== "undefined" && !navigator.onLine) {
      setLoading(false);
      return;
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout")), 3500)
    );

    try {
      const fetchLib = supabase
        .from("libraries")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();

      const { data: libData, error: libErr }: any = await Promise.race([fetchLib, timeoutPromise]);

      if (libErr || !libData) {
        if (!cached) router.replace("/");
        return;
      }

      const selected = libData as LibraryInfo;
      setCurrentLib(selected);

      const savedConfig = selected.seats_config || "A1-A25, B1-B25";
      setSeatConfigInput(savedConfig);
      const parsedSeatNames = parseCustomSeats(savedConfig);
      setAllSeatNames(parsedSeatNames);

      const isDateExpired = selected.expiry_date
        ? new Date(selected.expiry_date).getTime() < new Date().setHours(0, 0, 0, 0)
        : false;

      if (selected.plan_status === "inactive" || isDateExpired) {
        setIsLibraryActive(false);
        setLoading(false);
        return;
      }

      setIsLibraryActive(true);

      const fetchStudents = supabase
        .from("students")
        .select("*")
        .eq("library_id", selected.id)
        .order("created_at", { ascending: false });

      const { data: stuData }: any = await Promise.race([fetchStudents, timeoutPromise]);

      let formattedStudents: Student[] = [];
      if (stuData) {
        formattedStudents = stuData.map((item: any) => {
          const joining = item.joining_date || item.due_date || todayStr;
          const lastPaid = item.last_paid_date || null;
          const { dueDateText, status, pendingMonths } = calculateMonthlyDue(joining, lastPaid, item.status);

          return {
            id: item.id,
            seatNo: item.seat_no || "FLOATING",
            name: item.name,
            phone: item.phone,
            shift: (item.shift || "Morning") as Shift,
            monthlyFee: Number(item.monthly_fee),
            joiningDate: joining,
            lastPaidDate: lastPaid,
            lastPaymentMode: item.last_payment_mode || "Cash",
            dueDate: dueDateText,
            status: status,
            pendingMonths: pendingMonths,
          };
        });
        setStudents(formattedStudents);
      }

      const { data: inqData } = await supabase
        .from("inquiries")
        .select("*")
        .eq("library_id", selected.id)
        .order("created_at", { ascending: false });

      const finalInquiries = (inqData as Inquiry[]) || [];
      setInquiries(finalInquiries);

      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          currentLib: selected,
          students: formattedStudents,
          inquiries: finalInquiries,
        })
      );
    } catch (err) {
      console.warn("Using instant cache fallback:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      loadData();
    }
  }, [isAuthorized, libId]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!checkOnlineStatus()) return;
    const file = e.target.files?.[0];
    if (!file || !currentLib?.id) return;

    try {
      setUploadingLogo(true);
      const fileExt = file.name.split(".").pop();
      const fileName = `logo-${currentLib.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("library-logos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("library-logos")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from("libraries")
        .update({ logo_url: publicUrl })
        .eq("id", currentLib.id);

      if (updateError) throw updateError;

      setCurrentLib((prev) => (prev ? { ...prev, logo_url: publicUrl } : null));
      showToast("Library logo successfully updated!");
    } catch (err: any) {
      alert("Logo upload failed: " + (err.message || "Unknown error"));
    } finally {
      setUploadingLogo(false);
    }
  }

  const activeStudents = useMemo(() => students.filter((s) => s.status !== "Left"), [students]);
  const leftStudents = useMemo(() => students.filter((s) => s.status === "Left"), [students]);

  const randomStudentsCount = activeStudents.filter((s) => s.shift === "Random").length;
  const fixedStudents = activeStudents.filter((s) => s.shift !== "Random");
  const bookedSeatNumbers = useMemo(() => {
    return Array.from(new Set(fixedStudents.map((s) => s.seatNo.toUpperCase())));
  }, [fixedStudents]);

  const seatGridOccupantMap = useMemo(() => {
    const map = new Map<string, Student>();
    activeStudents.forEach((s) => {
      if (s.seatNo !== "FLOATING" && s.seatNo !== "VACATED" && s.shift !== "Random") {
        if (
          seatShiftView === "All" ||
          s.shift === seatShiftView ||
          s.shift === "Full Day" ||
          seatShiftView === "Full Day"
        ) {
          map.set(s.seatNo.trim().toUpperCase(), s);
        }
      }
    });
    return map;
  }, [activeStudents, seatShiftView]);

  const vacantSeatList = useMemo(() => {
    const bookedSet = new Set(
      activeStudents
        .filter((s) => {
          if (s.shift === "Random") return false;
          if (vacantShiftFilter === "All") return true;
          if (s.shift === "Full Day" || vacantShiftFilter === "Full Day") return true;
          return s.shift === vacantShiftFilter;
        })
        .map((s) => s.seatNo.trim().toUpperCase())
    );

    return allSeatNames.filter((seat) => !bookedSet.has(seat.trim().toUpperCase()));
  }, [allSeatNames, activeStudents, vacantShiftFilter]);

  const dueToday = activeStudents.filter((s) => s.status === "Due Today");
  const overdue = activeStudents.filter((s) => s.status === "Overdue");
  const paid = activeStudents.filter((s) => s.status === "Paid");
  const dueTotalAmount = [...dueToday, ...overdue].reduce(
    (sum, s) => sum + s.monthlyFee * Math.max(1, s.pendingMonths),
    0
  );
  const monthRevenue = paid.reduce((sum, s) => sum + s.monthlyFee, 0);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: `Active (${activeStudents.length})` },
    { id: "due", label: `Due Today (${dueToday.length})` },
    { id: "overdue", label: `Overdue (${overdue.length})` },
    { id: "paid", label: `Paid (${paid.length})` },
    { id: "left", label: `Left (${leftStudents.length})` },
  ];

  const filtered = useMemo(() => {
    const byStatus =
      filter === "due"
        ? dueToday
        : filter === "overdue"
          ? overdue
          : filter === "paid"
            ? paid
            : filter === "left"
              ? leftStudents
              : activeStudents;

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
  }, [activeStudents, dueToday, filter, leftStudents, overdue, paid, query]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }

  function reminderText(student: Student) {
    const libName = currentLib?.name || "LIBRARY MANAGEMENT";
    const owner = currentLib?.owner_name || "Owner";
    const totalAmount = student.monthlyFee * Math.max(1, student.pendingMonths);
    const monthsText = student.pendingMonths > 1 ? ` (${student.pendingMonths} Months Overdue)` : "";
    const seatInfo = student.shift === "Random" ? "Floating/Random Shift" : `Seat ${student.seatNo}`;
    return `Namaste ${student.name},\n\nThis is a reminder from ${libName}. Your ${seatInfo} monthly fee of ${formatINR(totalAmount)}${monthsText} is ${student.status === "Overdue" ? "overdue" : "due today"}.\n\nPlease complete the payment at your earliest convenience.\n\nThank you,\n${owner}\n${libName}`;
  }

  function openWhatsApp(student: Student) {
    const url = `https://wa.me/91${student.phone}?text=${encodeURIComponent(reminderText(student))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const handlePhoneChange = (enteredPhone: string) => {
    const cleanPhone = enteredPhone.replace(/\D/g, "").slice(-10);
    setForm((prev) => ({ ...prev, phone: cleanPhone }));

    if (!editingId && cleanPhone.length === 10) {
      const existing = students.find((s) => s.phone === cleanPhone);
      if (existing) {
        if (existing.status === "Left") {
          setRejoiningStudent(existing);
          setForm((prev) => ({
            ...prev,
            name: existing.name,
            monthlyFee: String(existing.monthlyFee),
            shift: existing.shift,
          }));
          showToast(`Purana student found (${existing.name})! Re-admission mode active.`);
        } else {
          setFormError(`⚠️ Yeh student already active hai (Seat: #${existing.seatNo})!`);
        }
      } else {
        setRejoiningStudent(null);
        setFormError("");
      }
    }
  };

  async function handleAddInquiry(e: React.FormEvent) {
    e.preventDefault();
    if (!checkOnlineStatus()) return;
    if (!currentLib?.id) return;

    const payload = {
      library_id: currentLib.id,
      name: inquiryForm.name.trim(),
      phone: inquiryForm.phone.replace(/\D/g, "").slice(-10),
      interested_shift: inquiryForm.shift,
      notes: inquiryForm.notes.trim(),
      status: "pending",
    };

    const { data, error } = await supabase.from("inquiries").insert([payload]).select();
    if (!error && data) {
      setInquiries((prev) => [data[0] as Inquiry, ...prev]);
      setShowInquiryModal(false);
      setInquiryForm({ name: "", phone: "", shift: "Morning", notes: "" });
      showToast("New Inquiry entry saved!");
    } else {
      alert("Error saving inquiry: " + (error?.message || "Unknown"));
    }
  }

  async function handleDeleteInquiry(id: string) {
    if (!checkOnlineStatus()) return;
    if (!confirm("Are you sure you want to delete this inquiry?")) return;
    const { error } = await supabase.from("inquiries").delete().eq("id", id);
    if (!error) {
      setInquiries((prev) => prev.filter((i) => i.id !== id));
      showToast("Inquiry deleted.");
    }
  }

  function handleConvertInquiryToStudent(inq: Inquiry) {
    handleOpenAdd();
    setForm({
      seatNo: "",
      name: inq.name,
      phone: inq.phone,
      shift: inq.interested_shift,
      monthlyFee: "900",
      joiningDate: todayStr,
    });
    setActiveTab("students");
  }

  function handleBulkWhatsAppInquiries() {
    if (inquiries.length === 0) {
      alert("Koi inquiry data available nahi hai!");
      return;
    }
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(broadcastMessage)}`;
    window.open(url, "_blank");
    setShowBroadcastModal(false);
  }

  function handleExportCSV() {
    if (students.length === 0) {
      alert("Export karne ke liye koi data nahi hai!");
      return;
    }

    const headers = [
      "Seat No",
      "Name",
      "Phone",
      "Shift",
      "Monthly Fee",
      "Joining Date",
      "Valid Until Date",
      "Payment Mode",
      "Status",
    ];
    const rows = students.map((s) => [
      `"${s.seatNo}"`,
      `"${s.name}"`,
      `"${s.phone}"`,
      `"${s.shift}"`,
      s.monthlyFee,
      `"${s.joiningDate}"`,
      `"${s.lastPaidDate || "N/A"}"`,
      `"${s.lastPaymentMode || "Cash"}"`,
      `"${s.status}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${currentLib?.name || "Library"}_Students_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Excel/CSV export downloaded!");
  }

  function handleOpenAdd(suggestedSeat = "") {
    setEditingId(null);
    setRejoiningStudent(null);
    setSavingStudent(false);
    setForm({
      seatNo: suggestedSeat,
      name: "",
      phone: "",
      shift: "Morning",
      monthlyFee: "900",
      joiningDate: todayStr,
    });
    setFormError("");
    setShowModal(true);
  }

  function handleOpenEdit(student: Student) {
    setEditingId(student.id);
    setRejoiningStudent(null);
    setSavingStudent(false);
    setForm({
      seatNo: student.seatNo === "FLOATING" ? "" : student.seatNo,
      name: student.name,
      phone: student.phone,
      shift: student.shift,
      monthlyFee: String(student.monthlyFee),
      joiningDate: student.joiningDate || todayStr,
    });
    setFormError("");
    setShowModal(true);
  }

  async function handleMarkLeft(student: Student) {
    if (!checkOnlineStatus()) return;
    if (
      !confirm(
        `Kya aap ${student.name} ki seat khali karke status 'Left' karna chahte hain? Inka purana record safe rahega.`
      )
    )
      return;

    const { error } = await supabase
      .from("students")
      .update({ status: "left", seat_no: "VACATED" })
      .eq("id", student.id);

    if (!error) {
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, status: "Left" as const, seatNo: "VACATED" } : s))
      );
      showToast(`${student.name} ki seat khali ho gayi.`);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!checkOnlineStatus()) return;
    if (!confirm(`Permanently Delete: Kya aap sach me ${name} ka record poori tarah hatana chahte hain?`))
      return;

    const { error } = await supabase.from("students").delete().eq("id", id);
    if (!error) {
      setStudents((prev) => prev.filter((s) => s.id !== id));
      showToast(`${name} ka record permanently hata diya gaya.`);
    }
  }

  function handleOpenCollect(student: Student) {
    setCollectStudent(student);
    setCollectMonths(Math.max(1, student.pendingMonths));
    setPaymentMode("Cash");
    setCollectCustomDate(getLocalDateString());
  }

  async function handleOpenHistory(student: Student) {
    setHistoryStudent(student);
    setLoadingHistory(true);

    const { data, error } = await supabase
      .from("fee_payments")
      .select("*")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPaymentHistory(data as PaymentRecord[]);
    } else {
      setPaymentHistory([]);
    }
    setLoadingHistory(false);
  }

  async function submitCollectFee(e: React.FormEvent) {
    e.preventDefault();
    if (!checkOnlineStatus()) return;
    if (!collectStudent || !currentLib?.id) return;

    const paymentDateUsed = collectCustomDate || getLocalDateString();
    const jParts = (collectStudent.joiningDate || todayStr).split("-").map(Number);
    const joinDay = jParts[2] || 1;

    const baseDate = new Date(paymentDateUsed);
    const paidUntil = new Date(baseDate.getFullYear(), baseDate.getMonth() + collectMonths, 1);
    const maxDays = new Date(paidUntil.getFullYear(), paidUntil.getMonth() + 1, 0).getDate();
    paidUntil.setDate(Math.min(joinDay, maxDays));
    const paidUntilStr = getLocalDateString(paidUntil);

    const totalCollected = collectStudent.monthlyFee * collectMonths;
    const targetStudent = collectStudent;
    const chosenMode = paymentMode;
    const countMonths = collectMonths;

    const { error: studentError } = await supabase
      .from("students")
      .update({
        status: "paid",
        last_paid_date: paidUntilStr,
        last_payment_mode: chosenMode,
      })
      .eq("id", targetStudent.id);

    if (studentError) {
      alert("Payment save nahi hui: " + studentError.message);
      return;
    }

    try {
      await supabase.from("fee_payments").insert([
        {
          library_id: currentLib.id,
          student_id: targetStudent.id,
          student_name: targetStudent.name,
          seat_no: targetStudent.seatNo || "FLOATING",
          amount_paid: totalCollected,
          months_count: countMonths,
          payment_mode: chosenMode,
          payment_date: paymentDateUsed,
          paid_until_date: paidUntilStr,
        },
      ]);
    } catch (err) {
      console.warn("Ledger insert error:", err);
    }

    setStudents((prev) =>
      prev.map((s) =>
        s.id === targetStudent.id
          ? {
              ...s,
              lastPaidDate: paidUntilStr,
              lastPaymentMode: chosenMode,
              status: "Paid" as const,
              pendingMonths: 0,
            }
          : s
      )
    );

    setCollectStudent(null);
    showToast(`Fees successfully collect ho gayi (${chosenMode})!`);

    try {
      downloadReceiptPDF(
        currentLib.name || "LIBRARY MANAGEMENT",
        currentLib.owner_name || "Manager",
        currentLib.phone || "9301530783",
        targetStudent,
        totalCollected,
        countMonths,
        chosenMode,
        paymentDateUsed
      );
    } catch (pdfErr) {
      console.error("PDF generation error:", pdfErr);
    }

    const seatInfo =
      targetStudent.shift === "Random" ? "Floating Seat" : `Seat ${targetStudent.seatNo}`;
    const waText = `Namaste ${targetStudent.name},\n\nWe have received your library fee payment of ${formatINR(
      totalCollected
    )} for ${countMonths} month(s) via ${chosenMode} (${seatInfo}) on ${formatDate(paymentDateUsed)}.\n\nYour official PDF receipt is attached.\n\nThank you,\n${
      currentLib.name || "LIBRARY MANAGEMENT"
    }`;
    const waUrl = `https://wa.me/91${targetStudent.phone}?text=${encodeURIComponent(waText)}`;

    setPaymentSuccessData({
      student: targetStudent,
      amount: totalCollected,
      months: countMonths,
      mode: chosenMode,
      waUrl: waUrl,
      paymentDate: paymentDateUsed,
    });

    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  async function handleSaveSeatConfiguration() {
    if (!checkOnlineStatus()) return;
    const parsed = parseCustomSeats(seatConfigInput);
    if (parsed.length === 0) {
      alert("Kripya valid seat pattern dalein (jaise A1-A20, B1-B20)");
      return;
    }

    const targetId = libId || localStorage.getItem("active_library_id");
    if (!targetId) return;

    const { error } = await supabase
      .from("libraries")
      .update({ seats_config: seatConfigInput })
      .eq("id", targetId);

    if (error) {
      alert("Error saving seats to database: " + error.message);
      return;
    }

    setAllSeatNames(parsed);
    showToast(`Total ${parsed.length} seats Supabase me save ho gayi!`);
  }

  async function handleSaveStudent(event: React.FormEvent) {
    event.preventDefault();
    if (!checkOnlineStatus()) return;

    if (savingStudent) return;
    setSavingStudent(true);
    setFormError("");

    try {
      const isRandom = form.shift === "Random";
      const seatNo = isRandom
        ? form.seatNo.trim().toUpperCase() || "FLOATING"
        : form.seatNo.trim().toUpperCase();

      const fee = Number(form.monthlyFee) || 900;
      const cleanPhone = form.phone.replace(/\D/g, "").slice(-10);

      if (!isRandom) {
        if (!seatNo) {
          setFormError("Kripya Seat No bharein!");
          setSavingStudent(false);
          return;
        }

        const targetId = editingId || rejoiningStudent?.id;
        const isBooked = activeStudents.some(
          (s) =>
            s.id !== targetId &&
            s.shift !== "Random" &&
            s.seatNo.toUpperCase() === seatNo &&
            (s.shift === form.shift || s.shift === "Full Day" || form.shift === "Full Day")
        );

        if (isBooked) {
          setFormError(`Seat ${seatNo} pehle se ${form.shift} shift me booked hai!`);
          setSavingStudent(false);
          return;
        }
      }

      const { dueDateText, status, pendingMonths } = calculateMonthlyDue(form.joiningDate, null);

      const payload: any = {
        name: form.name.trim(),
        phone: cleanPhone,
        seat_no: seatNo,
        shift: form.shift,
        monthly_fee: fee,
        joining_date: form.joiningDate,
        due_date: dueDateText,
        last_paid_date: null,
        status: "due",
        library_id: currentLib?.id,
      };

      if (rejoiningStudent) {
        const { error } = await supabase
          .from("students")
          .update(payload)
          .eq("id", rejoiningStudent.id);

        if (error) throw error;

        setStudents((prev) =>
          prev.map((s) =>
            s.id === rejoiningStudent.id
              ? {
                  ...s,
                  ...payload,
                  seatNo,
                  lastPaidDate: null,
                  status: "Due Today",
                  pendingMonths: 1,
                }
              : s
          )
        );

        showToast(`Welcome back! ${payload.name} ka re-admission ho gaya.`);
        setShowModal(false);
        setRejoiningStudent(null);
        return;
      }

      if (editingId) {
        const { error } = await supabase
          .from("students")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;

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
                  joiningDate: form.joiningDate,
                  dueDate: dueDateText,
                  status: status,
                  pendingMonths: pendingMonths,
                }
              : s
          )
        );
        showToast(`${payload.name} ka data update ho gaya!`);
        setShowModal(false);
        return;
      }

      const { data: existingCheck } = await supabase
        .from("students")
        .select("id, status")
        .eq("library_id", currentLib?.id)
        .eq("phone", cleanPhone)
        .maybeSingle();

      if (existingCheck && existingCheck.status !== "left") {
        setFormError("Yeh phone number already library me active hai!");
        setSavingStudent(false);
        return;
      }

      const { data, error } = await supabase.from("students").insert([payload]).select();
      if (error) throw error;

      if (data && data.length > 0) {
        const added = data[0];
        setStudents((prev) => [
          {
            id: added.id,
            seatNo: added.seat_no,
            name: added.name,
            phone: added.phone,
            shift: added.shift as Shift,
            monthlyFee: Number(added.monthly_fee),
            joiningDate: form.joiningDate,
            lastPaidDate: null,
            lastPaymentMode: "Cash",
            dueDate: dueDateText,
            status: "Due Today",
            pendingMonths: 1,
          },
          ...prev,
        ]);
        showToast(
          isRandom
            ? `${payload.name} ko Random shift me add kar diya.`
            : `${payload.name} ko seat ${seatNo} par jod diya.`
        );
      }

      setShowModal(false);
    } catch (err: any) {
      alert("Student save karne me error aaya: " + (err.message || "Unknown error"));
    } finally {
      setSavingStudent(false);
    }
  }

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
        <img src="/logo.png" alt="Logo" className="w-14 h-14 rounded-2xl animate-pulse" />
        <p>Verifying Session Access...</p>
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
              rel="noreferrer"
              className="w-full inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl transition text-sm"
            >
              Contact Support on WhatsApp
            </a>
            <button onClick={handleLogout} className="w-full py-2.5 text-xs text-slate-400 hover:text-white">
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-24 md:pb-12 font-sans antialiased">
      {/* Offline Alert Strip */}
      {!isOnline && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-xs font-bold py-1.5 px-4 text-center sticky top-0 z-50 shadow-sm flex items-center justify-center gap-2">
          <span>⚡ Offline Mode:</span>
          <span>Aap student data dekh sakte hain. Naya admission ya fees update karne ke liye internet connect karein.</span>
        </div>
      )}

      {/* Modern Glassmorphic Sticky Header */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          
          {/* Logo with Tap-to-Upload */}
          <div className="flex items-center gap-3">
            <label
              title="Click to change logo"
              className="relative cursor-pointer group flex items-center justify-center"
            >
              <img
                src={currentLib?.logo_url || "/logo.png"}
                alt="Library Logo"
                onError={(e) => {
                  (e.target as any).src = "/logo.png";
                }}
                className="h-11 w-11 rounded-2xl object-cover border border-slate-200 shadow-sm transition duration-200 group-hover:scale-105 group-hover:ring-2 group-hover:ring-indigo-500"
              />
              <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-white text-[10px] font-bold">
                ✏️
              </div>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploadingLogo}
                className="hidden"
              />
            </label>

            <div>
              <div className="flex items-center gap-2">
                <p className="text-base sm:text-lg font-black tracking-tight text-slate-950 leading-tight">
                  {currentLib?.name || "LIBRARY MANAGEMENT"}
                </p>
                <span className="hidden sm:inline-block text-[10px] font-extrabold bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                  Pro App
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Head: {currentLib?.owner_name || "Manager"}
                {uploadingLogo && <span className="ml-2 text-indigo-600 font-bold animate-pulse">(Updating Logo...)</span>}
              </p>
            </div>
          </div>

          {/* Desktop Tab Switcher */}
          <div className="hidden md:flex items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => setActiveTab("students")}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === "students"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>🎓 Students</span>
              <span className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-extrabold">
                {activeStudents.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("seats")}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === "seats"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>🪑 Seat Grid Map</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("inquiries")}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === "inquiries"
                  ? "bg-white text-purple-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>📋 Inquiries</span>
              <span className="text-[11px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-extrabold">
                {inquiries.length}
              </span>
            </button>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              title="Download CSV / Excel"
              className="text-xs bg-white hover:bg-slate-50 text-slate-700 font-bold px-3 py-2 rounded-xl border border-slate-200 shadow-xs transition"
            >
              📥 <span className="hidden sm:inline">Export</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Logout"
              className="text-xs bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-700 font-bold px-3 py-2 rounded-xl border border-slate-200 shadow-xs transition"
            >
              🚪 <span className="hidden sm:inline">Logout</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenAdd("")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-xs sm:text-sm font-bold text-white shadow-sm shadow-indigo-500/25 transition hover:from-indigo-700 hover:to-violet-700 active:scale-95"
            >
              <span className="text-base leading-none">+</span>
              <span>Add Student</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Metric Summary Cards */}
        <section className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
          <article className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-white p-4 sm:p-5 shadow-[0_2px_12px_-4px_rgba(79,70,229,0.08)]">
            <div className="flex justify-between items-start">
              <p className="text-xs font-bold text-indigo-950 uppercase tracking-wide">Total Enrolled</p>
              <span className="p-2 rounded-xl bg-indigo-600 text-white text-xs shadow-sm">🎓</span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-indigo-950">{activeStudents.length}</p>
            <p className="mt-1.5 text-xs text-slate-600 font-medium">
              <span className="font-extrabold text-slate-900">{bookedSeatNumbers.length}</span> Fixed ·{" "}
              <span className="font-extrabold text-rose-600">{randomStudentsCount}</span> Floating
            </p>
          </article>

          <article
            onClick={() => setShowVacantModal(true)}
            className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-white p-4 sm:p-5 shadow-[0_2px_12px_-4px_rgba(160,185,129,0.08)] cursor-pointer hover:border-emerald-300 transition hover:-translate-y-0.5"
          >
            <div className="flex justify-between items-start">
              <p className="text-xs font-bold text-emerald-950 uppercase tracking-wide">Vacant Seats</p>
              <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold shadow-xs">
                Manage
              </span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-emerald-900">
              {vacantSeatList.length}
            </p>
            <p className="mt-1.5 text-xs text-emerald-700 font-semibold">Out of {allSeatNames.length} fixed seats</p>
          </article>

          <article className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 via-white to-white p-4 sm:p-5 shadow-[0_2px_12px_-4px_rgba(245,158,11,0.1)]">
            <div className="flex justify-between items-start">
              <p className="text-xs font-bold text-amber-950 uppercase tracking-wide">Pending Fees</p>
              <span className="p-2 rounded-xl bg-amber-500 text-white text-xs shadow-sm">⚡</span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-amber-700">
              {formatINR(dueTotalAmount)}
            </p>
            <p className="mt-1.5 text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full w-max border border-rose-200">
              {dueToday.length + overdue.length} Students Due
            </p>
          </article>

          <article className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/70 via-white to-white p-4 sm:p-5 shadow-[0_2px_12px_-4px_rgba(168,85,247,0.08)]">
            <div className="flex justify-between items-start">
              <p className="text-xs font-bold text-purple-950 uppercase tracking-wide">Revenue This Month</p>
              <span className="p-2 rounded-xl bg-purple-600 text-white text-xs shadow-sm">₹</span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-purple-950">
              {formatINR(monthRevenue)}
            </p>
            <p className="mt-1.5 text-xs text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-full w-max border border-purple-200">
              {paid.length} Paid Students
            </p>
          </article>
        </section>

        {/* TAB 1: INTERACTIVE VISUAL SEAT GRID */}
        {activeTab === "seats" && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>Interactive Graphical Seat Map</span>
                  <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                    {allSeatNames.length} Total Configured
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Green seat par tap karke instant admission dein. Red/Yellow par tap karke student details dekhein.
                </p>
              </div>

              {/* Shift Switcher */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                {(["All", "Morning", "Evening", "Full Day"] as const).map((sh) => (
                  <button
                    key={sh}
                    onClick={() => setSeatShiftView(sh)}
                    className={`text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                      seatShiftView === sh
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {sh}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid Legend */}
            <div className="flex items-center gap-4 py-3 text-xs text-slate-600 font-semibold border-b border-slate-100 mb-5">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-emerald-500 shadow-sm"></span>
                <span>Vacant</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-rose-500 shadow-sm"></span>
                <span>Occupied (Paid)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-amber-500 shadow-sm"></span>
                <span>Fee Due / Overdue</span>
              </div>
            </div>

            {/* Grid Cells */}
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5 max-h-[600px] overflow-y-auto p-1">
              {allSeatNames.map((seatNum) => {
                const occupant = seatGridOccupantMap.get(seatNum.toUpperCase());

                if (occupant) {
                  const isDue = occupant.status === "Due Today" || occupant.status === "Overdue";
                  return (
                    <div
                      key={seatNum}
                      onClick={() => {
                        setQuery(occupant.name);
                        setActiveTab("students");
                      }}
                      className={`cursor-pointer p-2.5 rounded-2xl border text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                        isDue
                          ? "bg-amber-50 border-amber-300 text-amber-950"
                          : "bg-rose-50 border-rose-200 text-rose-950"
                      }`}
                      title={`${occupant.name} (${occupant.phone}) - Due: ${occupant.dueDate}`}
                    >
                      <span className="text-[10px] block font-mono font-black opacity-80">#{seatNum}</span>
                      <p className="text-xs font-extrabold truncate mt-0.5">{occupant.name}</p>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold mt-1 inline-block ${
                          isDue ? "bg-amber-200 text-amber-900" : "bg-rose-200 text-rose-900"
                        }`}
                      >
                        {occupant.status}
                      </span>
                    </div>
                  );
                }

                return (
                  <button
                    key={seatNum}
                    type="button"
                    onClick={() => handleOpenAdd(seatNum)}
                    className="p-2.5 rounded-2xl border-2 border-emerald-300/80 bg-emerald-50/60 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 text-emerald-800 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:scale-95 group"
                  >
                    <span className="text-[10px] block font-mono font-black text-emerald-600 group-hover:text-white">#{seatNum}</span>
                    <span className="text-[11px] font-bold block mt-0.5 uppercase">+ Free</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: REGISTERED STUDENTS VIEW */}
        {activeTab === "students" && (
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden mb-8">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex flex-wrap gap-2">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                      filter === item.id
                        ? "bg-slate-900 text-white shadow-sm"
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
                placeholder="Search name, seat, or phone..."
                className="w-full sm:max-w-xs rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1240px] w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200/70">
                  <tr>
                    <th className="px-5 py-3.5 font-bold">Seat No</th>
                    <th className="px-5 py-3.5 font-bold">Student Name</th>
                    <th className="px-5 py-3.5 font-bold">Phone & Contact</th>
                    <th className="px-5 py-3.5 font-bold">Shift</th>
                    <th className="px-5 py-3.5 font-bold">Monthly Fee</th>
                    <th className="px-5 py-3.5 font-bold">Joining Date</th>
                    <th className="px-5 py-3.5 font-bold">Valid Until (Next Due)</th>
                    <th className="px-5 py-3.5 font-bold">Pending Dues</th>
                    <th className="px-5 py-3.5 font-bold">Status</th>
                    <th className="px-5 py-3.5 font-bold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {loading && students.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-10 text-center text-slate-400">Loading data...</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-10 text-center text-slate-500">Koi student nahi mila.</td>
                    </tr>
                  ) : (
                    filtered.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex min-w-[3.25rem] items-center justify-center rounded-lg px-2.5 py-1 font-mono font-black ${
                              student.status === "Left"
                                ? "bg-slate-200 text-slate-600"
                                : student.shift === "Random"
                                  ? "bg-rose-100 text-rose-800 border border-rose-200"
                                  : "bg-slate-900 text-white"
                            }`}
                          >
                            {student.seatNo}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-900">{student.name}</td>
                        <td className="px-5 py-3.5 tabular-nums text-slate-600">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{student.phone}</span>
                            <a
                              href={`tel:${student.phone}`}
                              title="Call Student"
                              className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold"
                            >
                              📞
                            </a>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex rounded-md px-2.5 py-0.5 text-[10px] font-bold ${shiftBadge(student.shift)}`}>
                            {student.shift}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-extrabold text-slate-900">{formatINR(student.monthlyFee)}</td>
                        <td className="px-5 py-3.5 text-slate-500">{formatDate(student.joiningDate)}</td>
                        <td className="px-5 py-3.5">
                          {student.lastPaidDate ? (
                            <div>
                              <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md inline-block">
                                {formatDate(student.lastPaidDate)}
                              </span>
                              <span className="block text-[10px] text-slate-400 mt-0.5 font-medium">
                                Mode: {student.lastPaymentMode || "Cash"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Never / New</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {student.status === "Left" ? (
                            <span className="text-slate-400">Vacated</span>
                          ) : student.status === "Paid" ? (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              All Clear
                            </span>
                          ) : (
                            <div>
                              <span className="font-black text-rose-700">
                                {formatINR(student.monthlyFee * Math.max(1, student.pendingMonths))}
                              </span>
                              {student.pendingMonths > 1 && (
                                <span className="block text-[10px] text-rose-600 font-bold">
                                  ({student.pendingMonths} Months Overdue)
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusBadge(student.status)}`}>
                            {student.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {student.status !== "Left" && (
                              <>
                                <button
                                  type="button"
                                  title="Send WhatsApp Reminder"
                                  onClick={() => openWhatsApp(student)}
                                  className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-600 transition shadow-xs"
                                >
                                  💬 WA
                                </button>
                                {student.status !== "Paid" && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCollect(student)}
                                    className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs"
                                  >
                                    Collect ₹
                                  </button>
                                )}
                              </>
                            )}
                            <button
                              type="button"
                              title="View Payment History"
                              onClick={() => handleOpenHistory(student)}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                            >
                              📜 History
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(student)}
                              className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
                            >
                              Edit
                            </button>
                            {student.status !== "Left" ? (
                              <button
                                type="button"
                                title="Mark Left / Vacate Seat"
                                onClick={() => handleMarkLeft(student)}
                                className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 transition"
                              >
                                Vacate
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Delete Permanently"
                                onClick={() => handleDelete(student.id, student.name)}
                                className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-100 transition"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 3: INQUIRIES VIEW */}
        {activeTab === "inquiries" && (
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden mb-8">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="font-extrabold text-slate-900">New Admission Leads & Inquiries</h3>
                <p className="text-xs text-slate-500">Call, message or convert demo candidates into registered students.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5 transition"
                >
                  <span>📢 Broadcast</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowInquiryModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs transition"
                >
                  + Add Inquiry
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3 font-bold">Candidate Name</th>
                    <th className="px-5 py-3 font-bold">Phone & Contact</th>
                    <th className="px-5 py-3 font-bold">Interested Shift</th>
                    <th className="px-5 py-3 font-bold">Notes / Requirement</th>
                    <th className="px-5 py-3 font-bold">Inquiry Date</th>
                    <th className="px-5 py-3 font-bold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {inquiries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                        Abhi tak koi inquiry entry nahi hai. "+ Add Inquiry" se jod sakte hain.
                      </td>
                    </tr>
                  ) : (
                    inquiries.map((inq) => (
                      <tr key={inq.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5 font-bold text-slate-900">{inq.name}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-700 font-bold">{inq.phone}</span>
                            <a
                              href={`tel:${inq.phone}`}
                              title="Direct Call"
                              className="w-6 h-6 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md flex items-center justify-center text-xs font-bold"
                            >
                              📞
                            </a>
                            <a
                              href={`https://wa.me/91${inq.phone}?text=${encodeURIComponent(
                                `Namaste ${inq.name}, thank you for contacting ${currentLib?.name || "our library"}. Would you like to schedule your trial slot today?`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              title="WhatsApp Chat"
                              className="w-6 h-6 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md flex items-center justify-center text-xs font-bold"
                            >
                              💬
                            </a>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex rounded-md px-2.5 py-0.5 text-[10px] font-bold ${shiftBadge(inq.interested_shift)}`}>
                            {inq.interested_shift}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">{inq.notes || "General Inquiry"}</td>
                        <td className="px-5 py-3.5 text-slate-500">{formatDate(inq.created_at)}</td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleConvertInquiryToStudent(inq)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-2.5 py-1 rounded-md shadow-xs transition"
                            >
                              Confirm Admission 🎓
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteInquiry(inq.id)}
                              className="text-red-500 hover:text-red-700 font-bold px-2 py-1"
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
        )}
      </main>

      {/* MOBILE NATIVE BOTTOM BAR */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-slate-200 px-6 py-2.5 flex justify-between items-center shadow-lg">
        <button
          onClick={() => setActiveTab("students")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${
            activeTab === "students" ? "text-indigo-600" : "text-slate-400"
          }`}
        >
          <span className="text-base">🎓</span>
          <span>Students</span>
        </button>

        <button
          onClick={() => setActiveTab("seats")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${
            activeTab === "seats" ? "text-indigo-600" : "text-slate-400"
          }`}
        >
          <span className="text-base">🪑</span>
          <span>Seat Map</span>
        </button>

        <button
          onClick={() => setActiveTab("inquiries")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${
            activeTab === "inquiries" ? "text-purple-600" : "text-slate-400"
          }`}
        >
          <span className="text-base">📋</span>
          <span>Leads</span>
        </button>

        <button
          onClick={() => setShowVacantModal(true)}
          className="flex flex-col items-center gap-0.5 text-[10px] font-bold text-slate-400"
        >
          <span className="text-base">⚙️</span>
          <span>Config</span>
        </button>
      </nav>

      {/* MODAL: ADD INQUIRY */}
      {showInquiryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <form onSubmit={handleAddInquiry} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-3">
            <h3 className="text-base font-bold text-slate-900">Add New Admission Lead</h3>
            <input
              required
              placeholder="Candidate Name"
              value={inquiryForm.name}
              onChange={(e) => setInquiryForm({ ...inquiryForm, name: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              required
              placeholder="Phone (10 digits)"
              value={inquiryForm.phone}
              onChange={(e) => setInquiryForm({ ...inquiryForm, phone: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Interested Shift:</label>
              <select
                value={inquiryForm.shift}
                onChange={(e) => setInquiryForm({ ...inquiryForm, shift: e.target.value as Shift })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
              >
                <option value="Morning">Morning</option>
                <option value="Evening">Evening</option>
                <option value="Full Day">Full Day</option>
                <option value="Random">Random / Flexible</option>
              </select>
            </div>
            <textarea
              placeholder="Notes (e.g. Demanded Seat 12, Looking for demo slot)"
              value={inquiryForm.notes}
              onChange={(e) => setInquiryForm({ ...inquiryForm, notes: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs h-20"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowInquiryModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2 rounded-xl"
              >
                Save Inquiry
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: BULK WHATSAPP BROADCAST */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Broadcast WhatsApp Message</h3>
            <p className="text-xs text-slate-500">
              Yeh message aapke sabhi inquiries ({inquiries.length} candidates) ke liye WhatsApp compose karega.
            </p>
            <textarea
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-3 text-xs h-28 font-medium"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkWhatsAppInquiries}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
              >
                <span>🚀 Send Broadcast</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT STUDENT */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center backdrop-blur-xs">
          <form onSubmit={handleSaveStudent} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-slate-900">
                {editingId ? "Edit Student Details" : rejoiningStudent ? "Re-Admit Old Student 🔄" : "Add New Student"}
              </h2>
              <button 
                type="button" 
                onClick={() => setShowModal(false)} 
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {rejoiningStudent && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] p-2.5 rounded-xl flex items-center justify-between font-medium">
                <span>✨ <strong>Old Student Recognized:</strong> {rejoiningStudent.name} (Purani payment history linked rahegi)</span>
                <button 
                  type="button" 
                  onClick={() => setRejoiningStudent(null)} 
                  className="text-emerald-950 font-bold ml-2 text-xs"
                >
                  ✕
                </button>
              </div>
            )}

            {formError && <div className="text-xs text-red-600 font-bold bg-red-50 p-2 rounded-lg border border-red-200">⚠️ {formError}</div>}
            
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Shift:</label>
                  <select
                    value={form.shift}
                    onChange={(e) => setForm({ ...form, shift: e.target.value as Shift })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-white"
                  >
                    <option value="Morning">Morning</option>
                    <option value="Evening">Evening</option>
                    <option value="Full Day">Full Day</option>
                    <option value="Random">Random</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">
                    Seat No: {form.shift === "Random" && <span className="text-rose-500 font-normal">(Optional)</span>}
                  </label>
                  <input
                    required={form.shift !== "Random"}
                    placeholder={form.shift === "Random" ? "Floating Seat" : "e.g. A01, B12"}
                    value={form.seatNo}
                    onChange={(e) => setForm({ ...form, seatNo: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold outline-none bg-white"
                  />
                </div>
              </div>

              {form.shift === "Random" && (
                <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  ℹ <strong>Random Shift:</strong> Is student ko koi fix seat allot nahi hogi (Floating Seating).
                </p>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Student Full Name:</label>
                <input
                  required
                  placeholder="Student Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none bg-white font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Phone / WhatsApp Number:</label>
                <input
                  required
                  placeholder="10 Digits Mobile Number"
                  value={form.phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none bg-white font-mono font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Monthly Fee (₹):</label>
                  <input
                    required
                    type="number"
                    placeholder="Monthly Fee (₹)"
                    value={form.monthlyFee}
                    onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Joining Date:</label>
                  <input
                    required
                    type="date"
                    value={form.joiningDate}
                    onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingStudent}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition ${
                  savingStudent
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
                }`}
              >
                {savingStudent ? "Saving Student..." : rejoiningStudent ? "Re-Admit Student 🔄" : "Save Student"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: MULTI-MONTH FEE COLLECTION WITH CUSTOM PAYMENT DATE */}
      {collectStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <form onSubmit={submitCollectFee} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Collect Student Fee</h3>
            <p className="text-xs text-slate-500 mt-1">
              Student: <strong className="text-slate-800">{collectStudent.name}</strong> ({collectStudent.shift === "Random" ? "Floating Seat" : `Seat ${collectStudent.seatNo}`})
            </p>

            <div className="mt-4 space-y-3.5">
              {/* 🟢 CUSTOM PAYMENT DATE PICKER */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">Payment Date Received:</label>
                  <span className="text-[10px] text-indigo-600 font-semibold">(Auto today)</span>
                </div>
                <input
                  type="date"
                  value={collectCustomDate}
                  onChange={(e) => setCollectCustomDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-bold bg-slate-50 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Select Duration (Months):</label>
                <select
                  value={collectMonths}
                  onChange={(e) => setCollectMonths(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-bold bg-slate-50 text-slate-900"
                >
                  <option value={1}>1 Month (Current Due)</option>
                  <option value={2}>2 Months</option>
                  <option value={3}>3 Months</option>
                  <option value={4}>4 Months</option>
                  <option value={6}>6 Months (Half Year)</option>
                  <option value={12}>12 Months (Full Year)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Payment Mode:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMode("Cash")}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      paymentMode === "Cash"
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    💵 Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode("UPI/Online")}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      paymentMode === "UPI/Online"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    📱 UPI / Online
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 flex justify-between items-center">
                <span className="text-xs text-slate-600 font-bold">Total Amount Receiving:</span>
                <span className="text-base font-black text-emerald-700">
                  {formatINR(collectStudent.monthlyFee * collectMonths)}
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCollectStudent(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm"
              >
                Confirm & Mark Paid
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: VACANT SEATS & SEAT CAPACITY CONFIG */}
      {showVacantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Seat Capacity & Vacant Seats</h3>
                <p className="text-xs text-slate-500">Synced directly with Supabase Database</p>
              </div>
              <button onClick={() => setShowVacantModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Configure Fixed Seats (e.g. A1-A25, B1-B25, HALL-1):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={seatConfigInput}
                    onChange={(e) => setSeatConfigInput(e.target.value)}
                    placeholder="A1-A10, B1-B10"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white font-mono font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleSaveSeatConfiguration}
                    className="bg-indigo-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700"
                  >
                    Save to DB
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600">Check Available Seats In Shift:</span>
                  <span className="text-xs font-bold text-emerald-700">
                    {vacantSeatList.length} Seats Available
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["All", "Morning", "Evening", "Full Day"] as const).map((shift) => (
                    <button
                      key={shift}
                      type="button"
                      onClick={() => setVacantShiftFilter(shift)}
                      className={`text-xs px-3 py-1 rounded-lg font-bold transition ${
                        vacantShiftFilter === shift
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {shift}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] text-slate-400 mb-1.5 font-medium">
                  Click on any green seat to allocate student immediately:
                </p>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-3 bg-emerald-50/40 rounded-xl border border-emerald-100">
                  {vacantSeatList.length === 0 ? (
                    <span className="text-xs text-slate-400">Is shift me saari seats booked hain!</span>
                  ) : (
                    vacantSeatList.map((seat) => (
                      <button
                        key={seat}
                        type="button"
                        onClick={() => {
                          setShowVacantModal(false);
                          handleOpenAdd(seat);
                        }}
                        className="bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-900 text-xs px-2.5 py-1 rounded-lg font-black transition shadow-xs"
                      >
                        {seat} +
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowVacantModal(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PAYMENT HISTORY */}
      {historyStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Payment History</h3>
                <p className="text-xs text-slate-500">
                  Student: <strong className="text-slate-800">{historyStudent.name}</strong> ({historyStudent.shift === "Random" ? "Floating Seat" : `Seat ${historyStudent.seatNo}`})
                </p>
              </div>
              <button onClick={() => setHistoryStudent(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="mt-4 max-h-72 overflow-y-auto">
              {loadingHistory ? (
                <p className="text-xs text-slate-400 text-center py-8">Loading transactions...</p>
              ) : paymentHistory.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">Abhi tak koi payment record nahi mila.</p>
              ) : (
                <div className="space-y-2.5">
                  {paymentHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-900">{formatINR(item.amount_paid)}</span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                            {item.payment_mode}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                          Date: {formatDate(item.payment_date)} · {item.months_count} Month(s) Fee
                        </p>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md">
                        Paid
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryStudent(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PAYMENT SUCCESS & RECEIPT POPUP */}
      {paymentSuccessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-2xl mx-auto font-bold">
              ✓
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Payment Successful!</h3>
              <p className="text-xs text-slate-500 mt-1">
                {paymentSuccessData.student.name} ki {formatINR(paymentSuccessData.amount)} fees jama ho gayi hai ({paymentSuccessData.mode}).
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <a
                href={paymentSuccessData.waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                <span>📲 Open WhatsApp Chat</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  downloadReceiptPDF(
                    currentLib?.name || "LIBRARY MANAGEMENT",
                    currentLib?.owner_name || "Manager",
                    currentLib?.phone || "9301530783",
                    paymentSuccessData.student,
                    paymentSuccessData.amount,
                    paymentSuccessData.months,
                    paymentSuccessData.mode,
                    paymentSuccessData.paymentDate
                  );
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-xl text-xs"
              >
                📥 Download PDF Again
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPaymentSuccessData(null)}
              className="text-xs text-slate-400 hover:text-slate-600 pt-1 font-semibold"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 text-xs">Loading library...</div>}>
      <LibraryView />
    </Suspense>
  );
}