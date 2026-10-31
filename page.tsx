"use client";

import { useMemo, useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import jsPDF from "jspdf";

type Shift = "Morning" | "Evening" | "Full Day" | "Random";
type Status = "Paid" | "Due Today" | "Overdue" | "Left";
type Filter = "all" | "due" | "overdue" | "paid" | "left" | "custom";
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
  balanceDue?: number;
};

type Inquiry = {
  id: string;
  name: string;
  phone: string;
  interested_shift: Shift;
  interested_seat?: string | null;
  notes: string;
  status: "pending" | "admitted" | "closed";
  created_at: string;
  last_called_at?: string | null;
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

type ExpenseRecord = {
  id: string;
  library_id: string;
  title: string;
  amount: number;
  category: string;
  expense_date: string;
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
const WA_SERVER_URL = "https://whatsapp-crm-service.onrender.com/api/send-message?secret=89599301";

// Universal WhatsApp Alert & File Dispatcher (PDF / Image / Text)
async function sendWhatsAppAlert(
  phone: string,
  message: string,
  fileBase64?: string,
  fileType: "pdf" | "image" = "pdf",
  fileName?: string
) {
  try {
    let clean = phone.replace(/\D/g, "").slice(-10);
    if (clean.length === 10) {
      clean = "91" + clean;
    }
    await fetch(WA_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: clean,
        message,
        fileBase64,
        fileType,
        fileName,
      }),
    });
  } catch (err) {
    console.error("WhatsApp dispatch error:", err);
  }
}

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

// Generates PDF, triggers browser save, and returns clean pure Base64
function downloadReceiptPDF(
  libName: string,
  ownerName: string,
  ownerPhone: string,
  student: Student,
  amount: number,
  months: number,
  mode: string,
  paymentDateStr: string = getLocalDateString(),
  validUntilDateStr?: string
): string {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const receiptNo = `LIB-${Date.now().toString().slice(-6)}`;
  const dateStr = formatDate(paymentDateStr);

  const validTill = validUntilDateStr
    ? formatDate(validUntilDateStr)
    : (() => {
        const nextDue = new Date(paymentDateStr);
        nextDue.setMonth(nextDue.getMonth() + months);
        return nextDue.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      })();

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

  const seatLabel =
    student.shift === "Random" || student.seatNo === "FLOATING"
      ? "Floating Seat (Unassigned)"
      : `Seat No: ${student.seatNo}`;
  doc.setFont("helvetica", "bold");
  doc.text(seatLabel, 130, 64, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 65, 85);
  doc.text("Description", 14, 93);
  doc.text("Duration / Plan", 80, 93);
  doc.text("Amount", 134, 93, { align: "right" });
  doc.line(14, 96, 134, 96);

  doc.setFont("helvetica", "normal");
  doc.text("Library Seat Fee Payment", 14, 104);
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
  doc.text("* Fee once paid is non-refundable.", 14, 146);
  doc.text("* Maintain discipline inside library premises.", 14, 151);
  doc.text("* Seat change is strictly not allowed.", 14, 156);

  doc.line(90, 172, 132, 172);
  doc.setFontSize(8);
  doc.text("Authorized Signatory", 111, 177, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(ownerName || "Manager", 111, 182, { align: "center" });

  doc.save(`${student.name.replace(/\s+/g, "_")}_Fee_Receipt.pdf`);

  // Strip 'data:application/pdf;base64,' prefix completely
  const rawDataUri = doc.output("datauristring");
  return rawDataUri.split(",")[1];
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
  const joinYear = jParts[0];
  const joinMonth = jParts[1] - 1;
  const joinDay = jParts[2] || 1;

  if (!lastPaidDateStr) {
    const firstDueDate = new Date(joinYear, joinMonth, joinDay);
    firstDueDate.setHours(0, 0, 0, 0);

    const dueDateText = firstDueDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const diffTime = today.getTime() - firstDueDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return { dueDateText, status: "Due Today", pendingMonths: 1 };
    } else if (diffDays > 0) {
      const monthDiff = diffDays > 30 ? Math.max(2, Math.floor(diffDays / 30) + 1) : 1;
      return { dueDateText, status: "Overdue", pendingMonths: monthDiff };
    } else {
      return { dueDateText, status: "Paid", pendingMonths: 0 };
    }
  }

  const pParts = lastPaidDateStr.split("-").map(Number);
  const targetDue = new Date(pParts[0], pParts[1] - 1, pParts[2] || joinDay);
  targetDue.setHours(0, 0, 0, 0);

  const dueDateText = targetDue.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const diffTime = today.getTime() - targetDue.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { dueDateText, status: "Due Today", pendingMonths: 1 };
  } else if (diffDays > 0) {
    const monthDiff = diffDays > 30 ? Math.max(2, Math.floor(diffDays / 30) + 1) : 1;
    return { dueDateText, status: "Overdue", pendingMonths: monthDiff };
  } else {
    return { dueDateText, status: "Paid", pendingMonths: 0 };
  }
}

function LibraryView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const libId = searchParams.get("id");

  const [activeTab, setActiveTab] = useState<"students" | "seats" | "inquiries" | "expenses">("students");
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [currentLib, setCurrentLib] = useState<LibraryInfo | null>(null);
  const [isLibraryActive, setIsLibraryActive] = useState<boolean | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [showQrModal, setShowQrModal] = useState(false);

  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customFilterShift, setCustomFilterShift] = useState<string>("All");
  const [customDateFrom, setCustomDateFrom] = useState<string>("");
  const [customDateTo, setCustomDateTo] = useState<string>("");

  const [viewStudent, setViewStudent] = useState<Student | null>(null);

  const [savingStudent, setSavingStudent] = useState(false);
  const [rejoiningStudent, setRejoiningStudent] = useState<Student | null>(null);

  const [allSeatNames, setAllSeatNames] = useState<string[]>([]);
  const [seatConfigInput, setSeatConfigInput] = useState("A1-A25, B1-B25");
  const [showVacantModal, setShowVacantModal] = useState(false);
  const [seatShiftView, setSeatShiftView] = useState<Shift | "All">("Morning");
  const [vacantShiftFilter, setVacantShiftFilter] = useState<Shift | "All">("All");

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const [collectStudent, setCollectStudent] = useState<Student | null>(null);
  const [collectMonths, setCollectMonths] = useState<number>(1);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isFullSettlement, setIsFullSettlement] = useState<boolean>(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");
  const [collectCustomDate, setCollectCustomDate] = useState<string>(getLocalDateString());

  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    amount: "",
    category: "Rent",
    expense_date: getLocalDateString(),
  });

  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [editingInquiryId, setEditingInquiryId] = useState<string | null>(null);
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

  const todayStr = getLocalDateString();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    seatNo: "",
    name: "",
    phone: "",
    shift: "Morning" as Shift,
    monthlyFee: "600",
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
      alert("⚠️ Internet band hai! Kripya internet on karein.");
      return false;
    }
    return true;
  };

  const handleLogout = () => {
    if (!confirm("Kya aap sach me logout karna chahte hain?")) return;
    if (typeof window !== "undefined") {
      localStorage.removeItem("active_library_id");
      localStorage.removeItem("auth_token");
      sessionStorage.clear();
      document.cookie = "active_library_id=; path=/; max-age=0;";
    }
    router.replace("/");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedId = localStorage.getItem("active_library_id");
    const authToken = localStorage.getItem("auth_token");

    if (!savedId || !authToken || authToken !== `auth_verified_${savedId}`) {
      localStorage.removeItem("active_library_id");
      localStorage.removeItem("auth_token");
      router.replace("/");
      return;
    }

    if (libId && libId !== savedId) {
      router.replace(`/library?id=${savedId}`);
      return;
    }

    if (!libId && savedId) {
      router.replace(`/library?id=${savedId}`);
      return;
    }

    setIsAuthorized(true);
  }, [libId, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.history.pushState({ isRoot: true }, "", window.location.href);

    const handlePopState = () => {
      if (
        showModal ||
        showVacantModal ||
        showInquiryModal ||
        showBroadcastModal ||
        showExpenseModal ||
        showQrModal ||
        viewStudent ||
        collectStudent ||
        historyStudent
      ) {
        setShowModal(false);
        setShowVacantModal(false);
        setShowInquiryModal(false);
        setShowBroadcastModal(false);
        setShowExpenseModal(false);
        setShowQrModal(false);
        setViewStudent(null);
        setEditingInquiryId(null);
        setCollectStudent(null);
        setHistoryStudent(null);
        window.history.pushState({ isRoot: true }, "", window.location.href);
        return;
      }

      if (window.navigator && (window.navigator as any).app && (window.navigator as any).app.exitApp) {
        (window.navigator as any).app.exitApp();
        return;
      }
      window.close();

      window.history.pushState({ isRoot: true }, "", window.location.href);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [
    showModal,
    showVacantModal,
    showInquiryModal,
    showBroadcastModal,
    showExpenseModal,
    showQrModal,
    viewStudent,
    collectStudent,
    historyStudent,
  ]);

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
        setExpenses(parsed.expenses || []);
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
      setTimeout(() => reject(new Error("Network timeout")), 4000)
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
          const balance = Number(item.balance_due || 0);

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
            status: balance > 0 ? "Due Today" : status,
            pendingMonths: pendingMonths,
            balanceDue: balance,
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

      const { data: expData } = await supabase
        .from("library_expenses")
        .select("*")
        .eq("library_id", selected.id)
        .order("expense_date", { ascending: false });

      const finalExpenses = (expData as ExpenseRecord[]) || [];
      setExpenses(finalExpenses);

      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          currentLib: selected,
          students: formattedStudents,
          inquiries: finalInquiries,
          expenses: finalExpenses,
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

  const randomStudentsCount = activeStudents.filter(
    (s) => s.shift === "Random" || s.seatNo === "FLOATING"
  ).length;
  const fixedStudents = activeStudents.filter(
    (s) => s.shift !== "Random" && s.seatNo !== "FLOATING"
  );
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
          if (s.shift === "Random" || s.seatNo === "FLOATING") return false;
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
  
  const dueTotalAmount = [...dueToday, ...overdue].reduce((sum, s) => {
    if ((s.balanceDue || 0) > 0) return sum + s.balanceDue!;
    return sum + s.monthlyFee * Math.max(1, s.pendingMonths);
  }, 0);

  const monthRevenue = paid.reduce((sum, s) => sum + s.monthlyFee, 0);
  const totalExpensesAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netProfit = monthRevenue - totalExpensesAmount;

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: `Active (${activeStudents.length})` },
    { id: "due", label: `Due Today (${dueToday.length})` },
    { id: "overdue", label: `Overdue (${overdue.length})` },
    { id: "paid", label: `Paid (${paid.length})` },
    { id: "left", label: `Left (${leftStudents.length})` },
  ];

  const filtered = useMemo(() => {
    let baseList =
      filter === "due"
        ? dueToday
        : filter === "overdue"
          ? overdue
          : filter === "paid"
            ? paid
            : filter === "left"
              ? leftStudents
              : activeStudents;

    if (customFilterShift !== "All") {
      baseList = baseList.filter((s) => s.shift === customFilterShift);
    }
    if (customDateFrom) {
      baseList = baseList.filter((s) => s.joiningDate >= customDateFrom);
    }
    if (customDateTo) {
      baseList = baseList.filter((s) => s.joiningDate <= customDateTo);
    }

    const q = query.trim().toLowerCase();
    const matched = !q
      ? baseList
      : baseList.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.seatNo.toLowerCase().includes(q) ||
            s.phone.includes(q)
        );

    return [...matched].sort((a, b) =>
      a.seatNo.localeCompare(b.seatNo, undefined, SEAT_COLLATOR)
    );
  }, [
    activeStudents,
    dueToday,
    filter,
    leftStudents,
    overdue,
    paid,
    customFilterShift,
    customDateFrom,
    customDateTo,
    query,
  ]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }

  // ─── 5-DAY POLITE HINDI FEE REMINDER TEMPLATES ──────────────────────────
  function reminderText(student: Student) {
    const libName = currentLib?.name || "लाइब्रेरी";
    const contact = currentLib?.phone || "9301530783";
    const seatInfo =
      student.shift === "Random" || student.seatNo === "FLOATING"
        ? "Floating Slot"
        : student.seatNo;

    const totalAmount =
      (student.balanceDue || 0) > 0
        ? student.balanceDue!
        : student.monthlyFee * Math.max(1, student.pendingMonths);
    const formattedAmt = `₹${totalAmount}`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let diffDays = 0;

    // "28 Oct 2026" aur standard formats dono ko safely parse karega
    if (student.dueDate && student.dueDate !== "-") {
      let due = new Date(student.dueDate);
      if (isNaN(due.getTime())) {
        const monthsMap: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
        };
        const parts = student.dueDate.replace(/,/g, "").split(/\s+/);
        if (parts.length >= 3) {
          const day = parseInt(parts[0], 10);
          const monthKey = parts[1].slice(0, 3).toLowerCase();
          const year = parseInt(parts[2], 10);
          if (!isNaN(day) && monthsMap[monthKey] !== undefined && !isNaN(year)) {
            due = new Date(year, monthsMap[monthKey], day);
          }
        }
      }

      if (!isNaN(due.getTime())) {
        due.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - due.getTime();
        diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }
    }

    // Day 1: Due date wale din
    if (diffDays <= 0) {
      return `*📚 ${libName} - मासिक फीस स्मरण (Day 1)*
--------------------------------
*विद्यार्थी का नाम:* ${student.name}
*सीट नंबर:* ${seatInfo}
*अंतिम तिथि:* ${student.dueDate}
*फीस राशि:* ${formattedAmt}

नमस्ते ${student.name} जी, आशा है आपकी पढ़ाई अच्छी चल रही होगी। आपकी इस माह की लाइब्रेरी फीस का समय हो चुका है। कृपया समय मिलने पर अपनी फीस जमा कराएं ताकि आपकी सीट निर्बाध जारी रहे।

📞 *हेल्पडेस्क / UPI:* ${contact}`;
    }

    // Day 2: 1 Din Baad (Polite Follow-up)
    if (diffDays === 1) {
      return `*⏳ ${libName} - फीस नवीनीकरण सूचना (Day 2)*
--------------------------------
*विद्यार्थी का नाम:* ${student.name}
*सीट नंबर:* ${seatInfo}
*बकाया राशि:* ${formattedAmt}

नमस्ते ${student.name} जी, एक विनम्र स्मरण कि आपकी लाइब्रेरी फीस कल देय थी। यदि आपने पहले ही भुगतान कर दिया है तो कृपया हमें सूचित करें, अन्यथा आज समय निकालकर फीस रिन्यू कराने का कष्ट करें।

📞 *हेल्पडेस्क / UPI:* ${contact}`;
    }

    // Day 3: 2-3 Din Baad (Gentle Request)
    if (diffDays === 2 || diffDays === 3) {
      return `*📖 ${libName} - विनम्र स्मरण (Day 3)*
--------------------------------
*विद्यार्थी का नाम:* ${student.name}
*सीट नंबर:* ${seatInfo}
*बकाया राशि:* ${formattedAmt}

नमस्ते ${student.name} जी, आपकी लाइब्रेरी फीस पिछले कुछ दिनों से लंबित है। अध्ययन व्यवस्था और सीट प्रबंधन को सुचारु बनाए रखने हेतु कृपया आज अपनी फीस जमा कराकर सहयोग प्रदान करें।

📞 *हेल्पडेस्क / UPI:* ${contact}`;
    }

    // Day 4: 4 Din Baad (Seat Confirmation Request)
    if (diffDays === 4) {
      return `*ℹ️ ${libName} - सीट पुष्टि अनुरोध (Day 4)*
--------------------------------
*विद्यार्थी का नाम:* ${student.name}
*सीट नंबर:* ${seatInfo}
*बकाया राशि:* ${formattedAmt}

नमस्ते ${student.name} जी, आपकी मासिक फीस पिछले 4 दिनों से बकाया चल रही है। नए विद्यार्थियों के आग्रह के कारण कृपया हमें यह अवगत कराएं कि क्या आप इसी सीट (${seatInfo}) को आगे जारी रखना चाहते हैं? 

कृपया आज संपर्क कर अपनी सीट सुनिश्चित करा लें।

📞 *हेल्पडेस्क / UPI:* ${contact}`;
    }

    // Day 5+: 5 Din ya usse zyada (Polite Final Follow-up)
    return `*📩 ${libName} - विशेष अनुरोध (Day 5)*
--------------------------------
*विद्यार्थी का नाम:* ${student.name}
*सीट नंबर:* ${seatInfo}
*बकाया राशि:* ${formattedAmt}

नमस्ते ${student.name} जी, आपकी लाइब्रेरी फीस 5 दिनों से लंबित है। सीट की निरंतरता बनाए रखने के लिए आपसे सविनय निवेदन है कि आज प्रबंधन से संपर्क कर अपनी स्थिति स्पष्ट करने की कृपा करें, ताकि हम आपकी सीट सुरक्षित रख सकें।

📞 *हेल्पडेस्क / संपर्क:* ${contact}`;
  }

  function openWhatsApp(student: Student) {
    sendWhatsAppAlert(student.phone, reminderText(student));
    showToast(`WhatsApp reminder sent to ${student.name}!`);
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

  const handleCallInquiry = async (inqId: string, phone: string) => {
    const nowIso = new Date().toISOString();

    setInquiries((prev) =>
      prev.map((i) => (i.id === inqId ? { ...i, last_called_at: nowIso } : i))
    );

    try {
      await supabase
        .from("inquiries")
        .update({ last_called_at: nowIso })
        .eq("id", inqId);
    } catch (err) {
      console.warn("Call log save error:", err);
    }

    window.location.href = `tel:${phone}`;
  };

  function handleOpenEditInquiry(inq: Inquiry) {
    setEditingInquiryId(inq.id);
    setInquiryForm({
      name: inq.name,
      phone: inq.phone,
      shift: inq.interested_shift,
      notes: inq.notes || "",
    });
    setShowInquiryModal(true);
  }

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
      status: "pending" as const,
    };

    if (editingInquiryId) {
      const { error } = await supabase
        .from("inquiries")
        .update({
          name: payload.name,
          phone: payload.phone,
          interested_shift: payload.interested_shift,
          notes: payload.notes,
        })
        .eq("id", editingInquiryId);

      if (!error) {
        setInquiries((prev) =>
          prev.map((i) => (i.id === editingInquiryId ? { ...i, ...payload } : i))
        );
        setShowInquiryModal(false);
        setEditingInquiryId(null);
        setInquiryForm({ name: "", phone: "", shift: "Morning", notes: "" });
        showToast("Inquiry lead successfully update ho gayi!");
      } else {
        alert("Update error: " + (error?.message || "Unknown error"));
      }
    } else {
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
    handleOpenAdd(inq.interested_seat || "");
    setForm({
      seatNo: inq.interested_seat || "",
      name: inq.name,
      phone: inq.phone,
      shift: inq.interested_shift,
      monthlyFee: "600",
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

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!checkOnlineStatus()) return;
    if (!currentLib?.id) return;

    const payload = {
      library_id: currentLib.id,
      title: expenseForm.title.trim(),
      amount: Number(expenseForm.amount),
      category: expenseForm.category,
      expense_date: expenseForm.expense_date,
    };

    const { data, error } = await supabase.from("library_expenses").insert([payload]).select();
    if (!error && data) {
      setExpenses((prev) => [data[0] as ExpenseRecord, ...prev]);
      setShowExpenseModal(false);
      setExpenseForm({ title: "", amount: "", category: "Rent", expense_date: getLocalDateString() });
      showToast("Kharcha / Expense successfully add ho gaya!");
    } else {
      alert("Error saving expense: " + (error?.message || "Unknown error"));
    }
  }

  async function handleDeleteExpense(id: string) {
    if (!checkOnlineStatus()) return;
    if (!confirm("Kya aap is expense ko delete karna chahte hain?")) return;

    const { error } = await supabase.from("library_expenses").delete().eq("id", id);
    if (!error) {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      showToast("Expense deleted.");
    }
  }

  function handleExportCSV() {
    const dataToExport = filtered;

    if (dataToExport.length === 0) {
      alert("Export karne ke liye koi data nahi hai!");
      return;
    }

    const headers = [
      "Seat No",
      "Student Name",
      "Phone Number",
      "Shift",
      "Monthly Fee",
      "Joining Date",
      "Valid Until (Next Due)",
      "Pending Balance Due",
      "Status",
    ];

    const rows = dataToExport.map((s) => {
      const pendingAmount =
        (s.balanceDue || 0) > 0
          ? s.balanceDue!
          : s.status === "Paid"
            ? 0
            : s.monthlyFee * Math.max(1, s.pendingMonths);

      const validUntilValue = s.lastPaidDate ? s.lastPaidDate : "Never Paid";

      return [
        `"${s.seatNo}"`,
        `"${s.name}"`,
        `"${s.phone}"`,
        `"${s.shift}"`,
        s.monthlyFee,
        `"${s.joiningDate || "N/A"}"`,
        `"${validUntilValue}"`,
        pendingAmount,
        `"${(s.balanceDue || 0) > 0 ? "Partial Due" : s.status}"`,
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `${currentLib?.name || "Library"}_${filter.toUpperCase()}_Students_${todayStr}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`✓ ${dataToExport.length} ${filter} records export ho gaye!`);
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
      monthlyFee: "600",
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

  function toggleSelectAll() {
    if (selectedStudentIds.length === filtered.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filtered.map((s) => s.id));
    }
  }

  function toggleSelectStudent(id: string) {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  async function handleBulkMarkPaid() {
    if (selectedStudentIds.length === 0) return;
    if (!checkOnlineStatus()) return;
    if (
      !confirm(
        `Kya aap selected ${selectedStudentIds.length} students ko Paid mark karna chahte hain? Sabhi students ka cycle unki personal joining date ke hisaab se update hoga.`
      )
    )
      return;

    setBulkProcessing(true);
    try {
      const today = getLocalDateString();
      const studentsToUpdate = students.filter((s) => selectedStudentIds.includes(s.id));

      const ledgerInserts: any[] = [];
      const updatedMap = new Map<string, Partial<Student>>();

      for (const s of studentsToUpdate) {
        const isFirstPayment = !s.lastPaidDate;
        const paymentDateUsed = isFirstPayment && s.joiningDate ? s.joiningDate : today;

        const jParts = (s.joiningDate || today).split("-").map(Number);
        const joinDay = jParts[2] || 1;

        let baseCycleDate: Date;
        if (s.lastPaidDate) {
          const lp = s.lastPaidDate.split("-").map(Number);
          baseCycleDate = new Date(lp[0], lp[1] - 1, lp[2] || joinDay);
        } else {
          baseCycleDate = new Date(jParts[0], jParts[1] - 1, joinDay);
        }

        const paidUntil = new Date(baseCycleDate.getFullYear(), baseCycleDate.getMonth() + 1, 1);
        const maxDays = new Date(paidUntil.getFullYear(), paidUntil.getMonth() + 1, 0).getDate();
        paidUntil.setDate(Math.min(joinDay, maxDays));
        const paidUntilStr = getLocalDateString(paidUntil);

        ledgerInserts.push({
          library_id: currentLib?.id,
          student_id: s.id,
          student_name: s.name,
          seat_no: s.seatNo || "FLOATING",
          amount_paid: s.monthlyFee,
          months_count: 1,
          payment_mode: "Cash",
          payment_date: paymentDateUsed,
          paid_until_date: paidUntilStr,
        });

        const { dueDateText, status } = calculateMonthlyDue(s.joiningDate, paidUntilStr);

        updatedMap.set(s.id, {
          status: status,
          lastPaidDate: paidUntilStr,
          lastPaymentMode: "Cash",
          dueDate: dueDateText,
          balanceDue: 0,
          pendingMonths: 0,
        });

        await supabase
          .from("students")
          .update({
            status: "paid",
            balance_due: 0,
            last_paid_date: paidUntilStr,
            last_payment_mode: "Cash",
          })
          .eq("id", s.id);

        const autoReceiptMsg = `*🧾 लाइब्रेरी फीस रसीद (Fee Slip)*
--------------------------------
*संस्था:* ${currentLib?.name || "Library Management"}
*विद्यार्थी का नाम:* ${s.name}
*सीट नंबर:* ${s.seatNo || "FLOATING"}
*जमा राशि:* ${formatINR(s.monthlyFee)}
*भुगतान माध्यम:* Cash
*वैधता:* ${formatDate(paidUntilStr)}
*स्थिति:* सफल (Paid) ✅

धन्यवाद! संपर्क: +91 ${currentLib?.phone || "9301530783"}`;

        sendWhatsAppAlert(s.phone, autoReceiptMsg);
      }

      if (ledgerInserts.length > 0) {
        await supabase.from("fee_payments").insert(ledgerInserts);
      }

      setStudents((prev) =>
        prev.map((s) => {
          const updated = updatedMap.get(s.id);
          return updated ? ({ ...s, ...updated } as Student) : s;
        })
      );

      setSelectedStudentIds([]);
      showToast(`✓ ${studentsToUpdate.length} students paid! Receipts delivered on WhatsApp.`);
    } catch (err: any) {
      alert("Bulk payment me error: " + (err.message || "Unknown error"));
    } finally {
      setBulkProcessing(false);
    }
  }

  function handleBulkWhatsAppReminders() {
    const selected = students.filter((s) => selectedStudentIds.includes(s.id));
    const dueStudents = selected.filter((s) => s.status !== "Paid" && s.status !== "Left");

    if (dueStudents.length === 0) {
      alert("Selected students me kisi ki fees pending nahi hai!");
      return;
    }

    if (
      !confirm(
        `Selected ${dueStudents.length} pending students ko automated WhatsApp reminders deliver karein?`
      )
    )
      return;

    dueStudents.forEach((student, index) => {
      setTimeout(() => {
        sendWhatsAppAlert(student.phone, reminderText(student));
      }, index * 2000);
    });

    showToast(`${dueStudents.length} WhatsApp reminders dispatch ho gaye!`);
    setSelectedStudentIds([]);
  }

  async function handleSwapSeats() {
    if (selectedStudentIds.length !== 2) {
      alert("Seat swap karne ke liye theek 2 students select karein!");
      return;
    }

    const s1 = students.find((s) => s.id === selectedStudentIds[0]);
    const s2 = students.find((s) => s.id === selectedStudentIds[1]);
    if (!s1 || !s2) return;

    if (
      !confirm(
        `Kya aap ${s1.name} (Seat: ${s1.seatNo}) aur ${s2.name} (Seat: ${s2.seatNo}) ki seats aapas me badalna chahte hain?`
      )
    )
      return;

    setBulkProcessing(true);
    try {
      const seatA = s1.seatNo;
      const seatB = s2.seatNo;

      await supabase.from("students").update({ seat_no: seatB }).eq("id", s1.id);
      await supabase.from("students").update({ seat_no: seatA }).eq("id", s2.id);

      setStudents((prev) =>
        prev.map((s) => {
          if (s.id === s1.id) return { ...s, seatNo: seatB };
          if (s.id === s2.id) return { ...s, seatNo: seatA };
          return s;
        })
      );

      setSelectedStudentIds([]);
      showToast(`✓ Seats swap ho gayi: ${s1.name} (#${seatB}) ⇄ ${s2.name} (#${seatA})!`);
    } catch (err: any) {
      alert("Swap me error: " + (err.message || "Unknown error"));
    } finally {
      setBulkProcessing(false);
    }
  }

  function handleOpenCollect(student: Student) {
    const defaultMonths = Math.max(1, student.pendingMonths);
    setCollectStudent(student);
    setCollectMonths(defaultMonths);
    const defaultAmt =
      (student.balanceDue || 0) > 0 ? student.balanceDue! : student.monthlyFee * defaultMonths;
    setCustomAmount(String(defaultAmt));
    setIsFullSettlement(false);
    setPaymentMode("Cash");

    const isFirstTime = !student.lastPaidDate;
    setCollectCustomDate(isFirstTime && student.joiningDate ? student.joiningDate : getLocalDateString());
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

  async function handleDeletePaymentRecord(recordId: string) {
    if (!checkOnlineStatus()) return;
    if (!historyStudent) return;
    if (!confirm("Kya aap sach me is payment entry ko delete karna chahte hain? Isse student ka status recalculate ho jayega.")) return;

    try {
      const { error } = await supabase.from("fee_payments").delete().eq("id", recordId);
      if (error) throw error;

      const remainingHistory = paymentHistory.filter((p) => p.id !== recordId);
      setPaymentHistory(remainingHistory);

      const sorted = [...remainingHistory].sort(
        (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
      );
      const latestValidDate = sorted.length > 0 ? sorted[0].paid_until_date : null;

      const { dueDateText, status, pendingMonths } = calculateMonthlyDue(
        historyStudent.joiningDate,
        latestValidDate
      );

      await supabase
        .from("students")
        .update({
          last_paid_date: latestValidDate,
          status: status === "Paid" ? "paid" : "due",
        })
        .eq("id", historyStudent.id);

      setStudents((prev) =>
        prev.map((s) =>
          s.id === historyStudent.id
            ? {
                ...s,
                lastPaidDate: latestValidDate,
                dueDate: dueDateText,
                status: status,
                pendingMonths: pendingMonths,
              }
            : s
        )
      );

      setHistoryStudent((prev) => (prev ? { ...prev, lastPaidDate: latestValidDate, status, dueDate: dueDateText } : null));
      showToast("Payment delete ho gayi aur student ka due status update ho gaya!");
    } catch (err: any) {
      alert("Delete failed: " + (err.message || "Unknown error"));
    }
  }

  // ─── COLLECT FEE + AUTOMATIC CLEAN PDF ATTACHMENT SLIP TO WHATSAPP ─────────
  async function submitCollectFee(e: React.FormEvent) {
    e.preventDefault();
    if (!checkOnlineStatus()) return;
    if (!collectStudent || !currentLib?.id) return;

    const paymentDateUsed = collectCustomDate || getLocalDateString();
    const currentTotalReq = collectStudent.monthlyFee * collectMonths;
    const totalCollected = Number(customAmount) > 0 ? Number(customAmount) : currentTotalReq;

    const currentOldBalance = collectStudent.balanceDue || 0;
    const newBalanceDue = isFullSettlement
      ? 0
      : Math.max(0, currentOldBalance + currentTotalReq - totalCollected);

    const jParts = (collectStudent.joiningDate || todayStr).split("-").map(Number);
    const joinDay = jParts[2] || 1;

    let baseCycleDate: Date;
    if (collectStudent.lastPaidDate) {
      const lp = collectStudent.lastPaidDate.split("-").map(Number);
      baseCycleDate = new Date(lp[0], lp[1] - 1, lp[2] || joinDay);
    } else {
      baseCycleDate = new Date(jParts[0], jParts[1] - 1, joinDay);
    }

    let paidUntilStr = collectStudent.lastPaidDate;
    if (newBalanceDue === 0) {
      const paidUntil = new Date(baseCycleDate.getFullYear(), baseCycleDate.getMonth() + collectMonths, 1);
      const maxDays = new Date(paidUntil.getFullYear(), paidUntil.getMonth() + 1, 0).getDate();
      paidUntil.setDate(Math.min(joinDay, maxDays));
      paidUntilStr = getLocalDateString(paidUntil);
    }

    const targetStudent = collectStudent;
    const chosenMode = paymentMode;
    const countMonths = collectMonths;

    const { error: studentError } = await supabase
      .from("students")
      .update({
        status: newBalanceDue > 0 ? "due" : "paid",
        balance_due: newBalanceDue,
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

    const { dueDateText, status } = calculateMonthlyDue(targetStudent.joiningDate, paidUntilStr);

    setStudents((prev) =>
      prev.map((s) =>
        s.id === targetStudent.id
          ? {
              ...s,
              lastPaidDate: paidUntilStr,
              lastPaymentMode: chosenMode,
              dueDate: dueDateText,
              status: newBalanceDue > 0 ? ("Due Today" as Status) : status,
              pendingMonths: newBalanceDue > 0 ? 1 : 0,
              balanceDue: newBalanceDue,
            }
          : s
      )
    );

    setCollectStudent(null);

    // 1. Download Local PDF & Fetch pure Base64
    let generatedPdfBase64 = "";
    try {
      generatedPdfBase64 = downloadReceiptPDF(
        currentLib?.name || "LIBRARY MANAGEMENT",
        currentLib?.owner_name || "Manager",
        currentLib?.phone || "9301530783",
        targetStudent,
        totalCollected,
        countMonths,
        chosenMode,
        paymentDateUsed,
        paidUntilStr || undefined
      );
    } catch (pdfErr) {
      console.error("PDF generation error:", pdfErr);
    }

    // 2. Direct PDF Document Delivery on WhatsApp
    const seatInfo =
      targetStudent.shift === "Random" || targetStudent.seatNo === "FLOATING"
        ? "Floating Slot"
        : `Seat #${targetStudent.seatNo}`;

    const receiptSlipCaption = `*🧾 लाइब्रेरी फीस भुगतान रसीद (Official Receipt)*
--------------------------------
*लाइब्रेरी:* ${currentLib?.name || "Library Management"}
*विद्यार्थी का नाम:* ${targetStudent.name}
*सीट नंबर:* ${seatInfo}
*जमा की गई राशि:* ${formatINR(totalCollected)}
*भुगतान तिथि:* ${formatDate(paymentDateUsed)}
${
  newBalanceDue > 0
    ? `*शेष बकाया राशि:* ${formatINR(newBalanceDue)}`
    : `*वैधता (Valid Upto):* ${formatDate(paidUntilStr)}`
}
*स्थिति:* सफल (Paid & Verified) ✅

📄 आपकी ऑरिजिनल फीस रसीद (PDF) इस मैसेज के साथ संलग्न है।

संपर्क: +91 ${currentLib?.phone || "9301530783"}`;

    const pdfName = `${targetStudent.name.replace(/\s+/g, "_")}_Fee_Slip.pdf`;

    sendWhatsAppAlert(targetStudent.phone, receiptSlipCaption, generatedPdfBase64, "pdf", pdfName);

    showToast(`✓ Fees collect ho gayi aur WhatsApp slip PDF deliver ho gayi!`);
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
      const seatNo =
        isRandom || !form.seatNo.trim()
          ? form.seatNo.trim().toUpperCase() || "FLOATING"
          : form.seatNo.trim().toUpperCase();

      const fee = Number(form.monthlyFee) || 600;
      const cleanPhone = form.phone.replace(/\D/g, "").slice(-10);

      if (!isRandom && seatNo !== "FLOATING" && seatNo !== "WAITING" && seatNo !== "HOLD") {
        const targetId = editingId || rejoiningStudent?.id;
        const isBooked = activeStudents.some(
          (s) =>
            s.id !== targetId &&
            s.shift !== "Random" &&
            s.seatNo !== "FLOATING" &&
            s.seatNo.toUpperCase() === seatNo &&
            (s.shift === form.shift || s.shift === "Full Day" || form.shift === "Full Day")
        );

        if (isBooked) {
          setFormError(`Seat ${seatNo} pehle se is slot/shift me booked hai (Shift Collision)!`);
          setSavingStudent(false);
          return;
        }
      }

      if (rejoiningStudent) {
        const { dueDateText, pendingMonths } = calculateMonthlyDue(form.joiningDate, null);
        const rePayload: any = {
          name: form.name.trim(),
          phone: cleanPhone,
          seat_no: seatNo,
          shift: form.shift,
          monthly_fee: fee,
          joining_date: form.joiningDate,
          due_date: dueDateText,
          last_paid_date: null,
          status: "due",
          balance_due: 0,
          library_id: currentLib?.id,
        };

        const { error } = await supabase
          .from("students")
          .update(rePayload)
          .eq("id", rejoiningStudent.id);

        if (error) throw error;

        setStudents((prev) =>
          prev.map((s) =>
            s.id === rejoiningStudent.id
              ? {
                  ...s,
                  ...rePayload,
                  seatNo,
                  lastPaidDate: null,
                  status: "Due Today",
                  pendingMonths: 1,
                  balanceDue: 0,
                }
              : s
          )
        );

        showToast(`Welcome back! ${rePayload.name} ka re-admission ho gaya.`);
        setShowModal(false);
        setRejoiningStudent(null);
        return;
      }

      if (editingId) {
        const curr = students.find((s) => s.id === editingId);
        const joining = form.joiningDate || curr?.joiningDate || todayStr;
        const lastPaid = curr?.lastPaidDate || null;
        const { dueDateText, status, pendingMonths } = calculateMonthlyDue(joining, lastPaid, curr?.status);

        const editPayload: any = {
          name: form.name.trim(),
          phone: cleanPhone,
          seat_no: seatNo,
          shift: form.shift,
          monthly_fee: fee,
          joining_date: joining,
          due_date: dueDateText,
          status: (curr?.balanceDue || 0) > 0 ? "due" : status === "Paid" ? "paid" : "due",
        };

        const { error } = await supabase
          .from("students")
          .update(editPayload)
          .eq("id", editingId);

        if (error) throw error;

        setStudents((prev) =>
          prev.map((s) =>
            s.id === editingId
              ? {
                  ...s,
                  seatNo,
                  name: editPayload.name,
                  phone: editPayload.phone,
                  shift: form.shift,
                  monthlyFee: fee,
                  joiningDate: joining,
                  dueDate: dueDateText,
                  status: (curr?.balanceDue || 0) > 0 ? ("Due Today" as Status) : status,
                  pendingMonths: (curr?.balanceDue || 0) > 0 ? 1 : pendingMonths,
                }
              : s
          )
        );

        showToast(`Seat change ho gayi! Payment record safe hai.`);
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

      const { dueDateText, status, pendingMonths } = calculateMonthlyDue(form.joiningDate, null);
      const newPayload: any = {
        name: form.name.trim(),
        phone: cleanPhone,
        seat_no: seatNo,
        shift: form.shift,
        monthly_fee: fee,
        joining_date: form.joiningDate,
        due_date: dueDateText,
        last_paid_date: null,
        status: "due",
        balance_due: 0,
        library_id: currentLib?.id,
      };

      const { data, error } = await supabase.from("students").insert([newPayload]).select();
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
            balanceDue: 0,
          },
          ...prev,
        ]);
        showToast(
          seatNo === "FLOATING"
            ? `${newPayload.name} ko Advance/Floating slot me add kar diya.`
            : `${newPayload.name} ko seat ${seatNo} par jod diya.`
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
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-28 md:pb-12 font-sans antialiased">
      {!isOnline && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-xs font-bold py-1.5 px-4 text-center sticky top-0 z-50 shadow-sm flex items-center justify-center gap-2">
          <span>⚡ Offline Mode:</span>
          <span>Aap student data dekh sakte hain. Naya admission ya fees update karne ke liye internet connect karein.</span>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          
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

          <div className="hidden md:flex items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => setActiveTab("students")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
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
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
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
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
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
            <button
              type="button"
              onClick={() => setActiveTab("expenses")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === "expenses"
                  ? "bg-white text-rose-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>💰 Kharcha / Expenses</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              title="Student Self-Inquiry QR Code"
              className="text-xs bg-white hover:bg-indigo-50 text-indigo-700 font-bold px-3 py-2 rounded-xl border border-indigo-200 shadow-xs transition flex items-center gap-1.5"
            >
              <span>📱 QR Form</span>
            </button>
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
        <section className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-5 mb-6">
          <article className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-white p-4 sm:p-5 shadow-[0_2px_12px_-4px_rgba(79,70,229,0.08)]">
            <div className="flex justify-between items-start">
              <p className="text-xs font-bold text-indigo-950 uppercase tracking-wide">Total Enrolled</p>
              <span className="p-2 rounded-xl bg-indigo-600 text-white text-xs shadow-sm">🎓</span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-indigo-950">{activeStudents.length}</p>
            <p className="mt-1.5 text-xs text-slate-600 font-medium">
              <span className="font-extrabold text-slate-900">{bookedSeatNumbers.length}</span> Fixed ·{" "}
              <span className="font-extrabold text-rose-600">{randomStudentsCount}</span> Floating/Hold
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
              <p className="text-xs font-bold text-purple-950 uppercase tracking-wide">Gross Fee Collected</p>
              <span className="p-2 rounded-xl bg-purple-600 text-white text-xs shadow-sm">₹</span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-purple-950">{formatINR(monthRevenue)}</p>
            <p className="mt-1.5 text-xs text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-full w-max border border-purple-200">
              {paid.length} Paid Students
            </p>
          </article>

          <article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white p-4 sm:p-5 shadow-[0_2px_12px_-4px_rgba(16,185,129,0.1)]">
            <div className="flex justify-between items-start">
              <p className="text-xs font-bold text-emerald-950 uppercase tracking-wide">Net Profit</p>
              <span className="p-2 rounded-xl bg-emerald-600 text-white text-xs shadow-sm">📈</span>
            </div>
            <p className={`mt-2 text-2xl sm:text-3xl font-black tracking-tight ${netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {formatINR(netProfit)}
            </p>
            <p className="mt-1.5 text-xs text-slate-500 font-medium">
              Kharcha: <strong className="text-rose-600">{formatINR(totalExpensesAmount)}</strong>
            </p>
          </article>
        </section>

        {/* TAB 1: SEAT MAP */}
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

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5 max-h-[600px] overflow-y-auto p-1">
              {allSeatNames.map((seatNum) => {
                const occupant = seatGridOccupantMap.get(seatNum.toUpperCase());

                if (occupant) {
                  const isDue =
                    occupant.status === "Due Today" ||
                    occupant.status === "Overdue" ||
                    (occupant.balanceDue || 0) > 0;
                  return (
                    <div
                      key={seatNum}
                      onClick={() => {
                        setViewStudent(occupant);
                      }}
                      className={`cursor-pointer p-2.5 rounded-2xl border text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                        isDue
                          ? "bg-amber-50 border-amber-300 text-amber-950"
                          : "bg-rose-50 border-rose-200 text-rose-950"
                      }`}
                      title={`${occupant.name} (${occupant.phone}) - Click to view detail`}
                    >
                      <span className="text-[10px] block font-mono font-black opacity-80">#{seatNum}</span>
                      <p className="text-xs font-extrabold truncate mt-0.5">{occupant.name}</p>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold mt-1 inline-block ${
                          isDue ? "bg-amber-200 text-amber-900" : "bg-rose-200 text-rose-900"
                        }`}
                      >
                        {(occupant.balanceDue || 0) > 0 ? "Partial" : occupant.status}
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

        {/* TAB 2: STUDENTS VIEW */}
        {activeTab === "students" && (
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden mb-8">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                  <button
                    type="button"
                    onClick={() => setShowCustomFilter(!showCustomFilter)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition border flex items-center gap-1.5 ${
                      showCustomFilter || customFilterShift !== "All" || customDateFrom || customDateTo
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>⚙️ Custom Filter</span>
                    {(customFilterShift !== "All" || customDateFrom || customDateTo) && (
                      <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                    )}
                  </button>
                </div>

                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, seat, or phone..."
                  className="w-full sm:max-w-xs rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {showCustomFilter && (
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-wrap items-center gap-3 animate-in fade-in">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Shift:</label>
                    <select
                      value={customFilterShift}
                      onChange={(e) => setCustomFilterShift(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold"
                    >
                      <option value="All">All Shifts</option>
                      <option value="Morning">Morning</option>
                      <option value="Evening">Evening</option>
                      <option value="Full Day">Full Day</option>
                      <option value="Random">Random / Floating</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Joining From:</label>
                    <input
                      type="date"
                      value={customDateFrom}
                      onChange={(e) => setCustomDateFrom(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Joining To:</label>
                    <input
                      type="date"
                      value={customDateTo}
                      onChange={(e) => setCustomDateTo(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium"
                    />
                  </div>

                  {(customFilterShift !== "All" || customDateFrom || customDateTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomFilterShift("All");
                        setCustomDateFrom("");
                        setCustomDateTo("");
                      }}
                      className="text-xs text-rose-600 font-bold self-end py-1 hover:underline ml-auto"
                    >
                      Reset Filter
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Mobile View */}
            <div className="md:hidden divide-y divide-slate-100 p-2 space-y-2.5">
              {loading && students.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">Loading data...</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">Koi student nahi mila.</div>
              ) : (
                filtered.map((student) => {
                  const isSelected = selectedStudentIds.includes(student.id);
                  const isDue = student.status === "Due Today" || student.status === "Overdue" || (student.balanceDue || 0) > 0;
                  return (
                    <div
                      key={student.id}
                      className={`p-3.5 rounded-2xl border transition duration-150 ${
                        isSelected
                          ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20"
                          : isDue
                            ? "bg-white border-amber-200/90 shadow-xs"
                            : "bg-white border-slate-200/80 shadow-xs"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectStudent(student.id)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() => setViewStudent(student)}
                            className="text-left flex items-center gap-2 min-w-0"
                          >
                            <span
                              className={`inline-flex min-w-[2.75rem] items-center justify-center rounded-lg px-2 py-0.5 font-mono text-xs font-black ${
                                student.status === "Left"
                                  ? "bg-slate-200 text-slate-600"
                                  : student.shift === "Random" || student.seatNo === "FLOATING"
                                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                                    : "bg-slate-900 text-white"
                              }`}
                            >
                              {student.seatNo}
                            </span>
                            <span className="font-extrabold text-slate-900 text-sm truncate hover:text-indigo-600 underline-offset-2 hover:underline">
                              {student.name}
                            </span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={`tel:${student.phone}`}
                            title="Call Student"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs font-bold"
                          >
                            📞
                          </a>
                        </div>
                      </div>

                      <div
                        onClick={() => setViewStudent(student)}
                        className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs cursor-pointer"
                      >
                        <div className="space-y-0.5">
                          <p className="font-mono text-slate-600 font-semibold text-[11px]">{student.phone}</p>
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-[9px] font-bold ${shiftBadge(student.shift)}`}>
                            {student.shift}
                          </span>
                        </div>

                        <div className="text-right">
                          {(student.balanceDue || 0) > 0 ? (
                            <div>
                              <span className="font-black text-rose-700 text-xs">{formatINR(student.balanceDue!)}</span>
                              <span className="block text-[9px] text-amber-700 font-bold">Partial Balance</span>
                            </div>
                          ) : student.status === "Paid" ? (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[10px]">
                              Paid (All Clear)
                            </span>
                          ) : (
                            <div>
                              <span className="font-black text-rose-700 text-xs">
                                {formatINR(student.monthlyFee * Math.max(1, student.pendingMonths))}
                              </span>
                              <span className="block text-[9px] text-rose-600 font-bold">
                                {student.status} {student.pendingMonths > 1 && `(${student.pendingMonths}M)`}
                              </span>
                            </div>
                          )}
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Due: {student.dueDate}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                        {student.status !== "Left" && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenCollect(student)}
                              className="flex-1 bg-indigo-600 text-white font-bold py-1.5 px-2 rounded-xl text-xs shadow-xs hover:bg-indigo-700 active:scale-95 text-center"
                            >
                              Collect Fee ₹
                            </button>
                            <button
                              type="button"
                              onClick={() => openWhatsApp(student)}
                              className="bg-emerald-500 text-white font-bold py-1.5 px-2.5 rounded-xl text-xs shadow-xs hover:bg-emerald-600 active:scale-95"
                            >
                              💬 WA
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenHistory(student)}
                          className="bg-slate-100 text-slate-700 border border-slate-200 font-bold py-1.5 px-2.5 rounded-xl text-xs hover:bg-slate-200 active:scale-95"
                        >
                          📜
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(student)}
                          className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold py-1.5 px-2.5 rounded-xl text-xs hover:bg-indigo-100 active:scale-95"
                        >
                          ✏️
                        </button>
                        {student.status !== "Left" ? (
                          <button
                            type="button"
                            onClick={() => handleMarkLeft(student)}
                            className="bg-amber-50 text-amber-800 border border-amber-200 font-bold py-1.5 px-2 rounded-xl text-xs hover:bg-amber-100 active:scale-95"
                          >
                            Vacate
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDelete(student.id, student.name)}
                            className="bg-red-50 text-red-600 border border-red-200 font-bold py-1.5 px-2 rounded-xl text-xs hover:bg-red-100"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200/70">
                  <tr>
                    <th className="px-3 py-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selectedStudentIds.length === filtered.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        title="Select All Students"
                      />
                    </th>
                    <th className="px-4 py-3.5 font-bold">Seat No</th>
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
                      <td colSpan={11} className="px-5 py-10 text-center text-slate-400">Loading data...</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-5 py-10 text-center text-slate-500">Koi student nahi mila.</td>
                    </tr>
                  ) : (
                    filtered.map((student) => {
                      const isSelected = selectedStudentIds.includes(student.id);
                      return (
                        <tr
                          key={student.id}
                          className={`hover:bg-slate-50/80 transition ${
                            isSelected ? "bg-indigo-50/40" : ""
                          }`}
                        >
                          <td className="px-3 py-3.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectStudent(student.id)}
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={() => setViewStudent(student)}
                              className={`inline-flex min-w-[3.25rem] items-center justify-center rounded-lg px-2.5 py-1 font-mono font-black ${
                                student.status === "Left"
                                  ? "bg-slate-200 text-slate-600"
                                  : student.shift === "Random" || student.seatNo === "FLOATING"
                                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                                    : "bg-slate-900 text-white"
                              }`}
                            >
                              {student.seatNo}
                            </button>
                          </td>
                          <td className="px-5 py-3.5 font-bold text-slate-900">
                            <button
                              type="button"
                              onClick={() => setViewStudent(student)}
                              className="hover:text-indigo-600 transition text-left"
                            >
                              {student.name}
                            </button>
                          </td>
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
                            ) : (student.balanceDue || 0) > 0 ? (
                              <div>
                                <span className="font-black text-rose-700">
                                  {formatINR(student.balanceDue!)}
                                </span>
                                <span className="block text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5 w-max">
                                  Partial Balance
                                </span>
                              </div>
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
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              (student.balanceDue || 0) > 0 ? "bg-amber-100 text-amber-800 border border-amber-300 font-bold" : statusBadge(student.status)
                            }`}>
                              {(student.balanceDue || 0) > 0 ? "Partial" : student.status}
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
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCollect(student)}
                                    className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs"
                                  >
                                    Collect Fee ₹
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                title="View Payment History & Receipts"
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
                      );
                    })
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
                <p className="text-xs text-slate-500">Call, track timestamps, edit leads or convert into students.</p>
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
                  onClick={() => {
                    setEditingInquiryId(null);
                    setInquiryForm({ name: "", phone: "", shift: "Morning", notes: "" });
                    setShowInquiryModal(true);
                  }}
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
                    <th className="px-5 py-3 font-bold">Preferred Seat</th>
                    <th className="px-5 py-3 font-bold">Notes / Requirement</th>
                    <th className="px-5 py-3 font-bold">Inquiry Date</th>
                    <th className="px-5 py-3 font-bold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {inquiries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
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
                            <button
                              type="button"
                              onClick={() => handleCallInquiry(inq.id, inq.phone)}
                              title="Call Candidate & Log Time"
                              className="w-6 h-6 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md flex items-center justify-center text-xs font-bold transition"
                            >
                              📞
                            </button>
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
                          <div className="mt-1">
                            {inq.last_called_at ? (
                              <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium border border-indigo-100 inline-block">
                                🕒 Called: {new Date(inq.last_called_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, {new Date(inq.last_called_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Not called yet</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex rounded-md px-2.5 py-0.5 text-[10px] font-bold ${shiftBadge(inq.interested_shift)}`}>
                            {inq.interested_shift}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {inq.interested_seat ? (
                            <span className="inline-block bg-indigo-100 border border-indigo-300 text-indigo-900 font-mono font-black text-xs px-2.5 py-0.5 rounded-lg">
                              #{inq.interested_seat}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Not selected</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">{inq.notes || "General Inquiry"}</td>
                        <td className="px-5 py-3.5 text-slate-500">{formatDate(inq.created_at)}</td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleConvertInquiryToStudent(inq)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-2.5 py-1 rounded-md shadow-xs transition"
                            >
                              Enroll 🎓
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditInquiry(inq)}
                              title="Edit Lead"
                              className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteInquiry(inq.id)}
                              className="text-red-500 hover:text-red-700 font-bold px-2 py-1"
                              title="Delete Lead"
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

        {/* TAB 4: EXPENSES VIEW */}
        {activeTab === "expenses" && (
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden mb-8">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="font-extrabold text-slate-900">Monthly Expenses & Bills</h3>
                <p className="text-xs text-slate-500">Rent, Bijli, Wi-Fi, Water aur repairs ka kharcha track karein.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(true)}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5 transition active:scale-95"
                >
                  <span>+ Naya Kharcha Add Karein</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3 font-bold">Kharcha Detail</th>
                    <th className="px-5 py-3 font-bold">Category</th>
                    <th className="px-5 py-3 font-bold">Date</th>
                    <th className="px-5 py-3 font-bold">Amount (₹)</th>
                    <th className="px-5 py-3 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                        Is mahine koi kharcha add nahi hua hai.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5 font-bold text-slate-900">{exp.title}</td>
                        <td className="px-5 py-3.5">
                          <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                            {exp.category}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">{formatDate(exp.expense_date)}</td>
                        <td className="px-5 py-3.5 font-black text-rose-700 text-sm">
                          {formatINR(exp.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="text-rose-500 hover:text-rose-700 font-bold px-2 py-1"
                            title="Delete Expense"
                          >
                            🗑️ Delete
                          </button>
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

      {/* Floating Bulk Toolbar */}
      {selectedStudentIds.length > 0 && (
        <aside aria-label="Bulk actions toolbar" className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex flex-wrap items-center gap-3 border border-slate-700 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 max-w-[90vw]">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-black">
              {selectedStudentIds.length}
            </span>
            <span className="text-xs font-bold text-slate-300">Selected</span>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          <button
            type="button"
            disabled={bulkProcessing}
            onClick={handleBulkMarkPaid}
            className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-sm disabled:opacity-50"
          >
            <span>{bulkProcessing ? "..." : "⚡ Mark Paid & Send WA Slips"}</span>
          </button>

          <button
            type="button"
            onClick={handleBulkWhatsAppReminders}
            className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-sm"
          >
            <span>💬 Bulk WA Reminders</span>
          </button>

          {selectedStudentIds.length === 2 && (
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={handleSwapSeats}
              className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-sm disabled:opacity-50"
            >
              <span>⇄ Swap Seats</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSelectedStudentIds([])}
            className="text-xs text-slate-400 hover:text-white font-semibold transition ml-auto"
          >
            Clear
          </button>
        </aside>
      )}

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 px-2 py-2 flex items-center justify-around shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab("students")}
          className={`flex-1 flex flex-col items-center py-1 rounded-xl transition ${
            activeTab === "students" ? "text-indigo-600 bg-indigo-50/60 font-bold" : "text-slate-500"
          }`}
        >
          <span className="text-lg leading-none">🎓</span>
          <span className="text-[10px] mt-1">Students</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("seats")}
          className={`flex-1 flex flex-col items-center py-1 rounded-xl transition ${
            activeTab === "seats" ? "text-indigo-600 bg-indigo-50/60 font-bold" : "text-slate-500"
          }`}
        >
          <span className="text-lg leading-none">🪑</span>
          <span className="text-[10px] mt-1">Seats</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("inquiries")}
          className={`flex-1 flex flex-col items-center py-1 rounded-xl transition ${
            activeTab === "inquiries" ? "text-purple-600 bg-purple-50/60 font-bold" : "text-slate-500"
          }`}
        >
          <span className="text-lg leading-none">📋</span>
          <span className="text-[10px] mt-1">Leads</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("expenses")}
          className={`flex-1 flex flex-col items-center py-1 rounded-xl transition ${
            activeTab === "expenses" ? "text-rose-600 bg-rose-50/60 font-bold" : "text-slate-500"
          }`}
        >
          <span className="text-lg leading-none">💰</span>
          <span className="text-[10px] mt-1">Kharcha</span>
        </button>

        <button
          type="button"
          onClick={() => setShowVacantModal(true)}
          className="flex-1 flex flex-col items-center py-1 rounded-xl text-slate-500 active:scale-95 transition"
        >
          <span className="text-lg leading-none">⚙️</span>
          <span className="text-[10px] mt-1">Config</span>
        </button>
      </nav>

      {/* Modal: QR */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h3 className="text-sm font-extrabold text-slate-900">Student Self-Inquiry QR</h3>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Is QR ko student scan karke apni self-inquiry bharenge aur vacant seats check karenge.
            </p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center">
              <img
                src={`https://quickchart.io/qr?text=${encodeURIComponent(
                  `${typeof window !== "undefined" ? window.location.origin : ""}/inquiry?lib_id=${currentLib?.id}`
                )}&size=240&margin=2`}
                alt="Inquiry QR Code"
                className="w-48 h-48 rounded-xl shadow-xs"
              />
            </div>

            <p className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 py-1.5 px-3 rounded-lg truncate">
              {typeof window !== "undefined" ? window.location.origin : ""}/inquiry?lib_id={currentLib?.id}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl text-xs transition"
              >
                🖨️ Print QR Poster
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Student Detail */}
      {viewStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  Student Profile
                </span>
                <h3 className="text-lg font-black text-slate-950 mt-1">{viewStudent.name}</h3>
                <p className="text-xs text-slate-500 font-mono">Phone: {viewStudent.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewStudent(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Seat Assigned</span>
                  <span className="text-sm font-black text-slate-900">
                    {viewStudent.seatNo === "FLOATING" ? "Floating" : `#${viewStudent.seatNo}`}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Shift</span>
                  <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold mt-0.5 ${shiftBadge(viewStudent.shift)}`}>
                    {viewStudent.shift}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl border border-slate-100 bg-white shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 block">Monthly Fee</span>
                  <span className="text-xs font-black text-slate-900">{formatINR(viewStudent.monthlyFee)}</span>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-100 bg-white shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 block">Current Status</span>
                  <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold mt-0.5 ${statusBadge(viewStudent.status)}`}>
                    {(viewStudent.balanceDue || 0) > 0 ? "Partial Due" : viewStudent.status}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Admission / Joining:</span>
                  <span className="font-bold text-slate-900">{formatDate(viewStudent.joiningDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Fee Paid Date:</span>
                  <span className="font-bold text-slate-900">
                    {viewStudent.lastPaidDate ? formatDate(viewStudent.lastPaidDate) : "Never (New)"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Valid Till / Next Due:</span>
                  <span className="font-bold text-emerald-800">{viewStudent.dueDate}</span>
                </div>
                <div className="flex justify-between border-t border-indigo-100 pt-1.5">
                  <span className="text-slate-700 font-bold">Total Pending Amount:</span>
                  <span className="font-black text-rose-700 text-sm">
                    {(viewStudent.balanceDue || 0) > 0
                      ? formatINR(viewStudent.balanceDue!)
                      : viewStudent.status === "Paid"
                        ? "₹0 (Clear)"
                        : formatINR(viewStudent.monthlyFee * Math.max(1, viewStudent.pendingMonths))}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const s = viewStudent;
                  setViewStudent(null);
                  handleOpenCollect(s);
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs shadow-sm transition active:scale-95"
              >
                Collect Fee ₹
              </button>
              <button
                type="button"
                onClick={() => {
                  const s = viewStudent;
                  setViewStudent(null);
                  handleOpenHistory(s);
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-3 rounded-xl text-xs transition active:scale-95"
              >
                📜 Full History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Expense */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <form onSubmit={handleAddExpense} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900">Add Library Expense / Kharcha</h3>
              <button
                type="button"
                onClick={() => setShowExpenseModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Expense Name / Title:</label>
              <input
                required
                placeholder="e.g. Electricity Bill, Room Rent, Wi-Fi"
                value={expenseForm.title}
                onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Category:</label>
              <select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
              >
                <option value="Rent">Rent</option>
                <option value="Electricity">Electricity / Bijli</option>
                <option value="Internet">Internet / Wi-Fi</option>
                <option value="Water">Water Bottles</option>
                <option value="Maintenance">Maintenance & Repairs</option>
                <option value="Other">Other Expenses</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Amount (₹):</label>
                <input
                  required
                  type="number"
                  placeholder="Amount"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Date:</label>
                <input
                  required
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExpenseModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 rounded-xl"
              >
                Save Expense
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Add Inquiry */}
      {showInquiryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <form onSubmit={handleAddInquiry} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900">
                {editingInquiryId ? "Edit Admission Lead" : "Add New Admission Lead"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowInquiryModal(false);
                  setEditingInquiryId(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                ✕
              </button>
            </div>

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
                onClick={() => {
                  setShowInquiryModal(false);
                  setEditingInquiryId(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2 rounded-xl"
              >
                {editingInquiryId ? "Update Lead" : "Save Inquiry"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Broadcast */}
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

      {/* Modal: Add/Edit Student */}
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
                    Seat No: <span className="text-slate-400 font-normal">(Optional for Advance)</span>
                  </label>
                  <input
                    placeholder="e.g. A01 ya WAITING / HOLD"
                    value={form.seatNo}
                    onChange={(e) => setForm({ ...form, seatNo: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold outline-none bg-white font-mono"
                  />
                </div>
              </div>

              {form.shift === "Random" && (
                <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  ℹ <strong>Random Shift:</strong> Seat number khali chhodne par ise automatically floating seat allot ho jayegi.
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

      {/* Modal: Collect Fee */}
      {collectStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <form onSubmit={submitCollectFee} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Collect Student Fee</h3>
            <p className="text-xs text-slate-500 mt-1">
              Student: <strong className="text-slate-800">{collectStudent.name}</strong> ({collectStudent.shift === "Random" || collectStudent.seatNo === "FLOATING" ? "Floating Slot" : `Seat ${collectStudent.seatNo}`})
            </p>

            <div className="mt-4 space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">Payment Date Received:</label>
                  <span className="text-[10px] text-indigo-600 font-semibold">
                    {!collectStudent.lastPaidDate ? "(Auto Joining Date)" : "(Auto Today)"}
                  </span>
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
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setCollectMonths(m);
                    const def = (collectStudent.balanceDue || 0) > 0 ? collectStudent.balanceDue! : collectStudent.monthlyFee * m;
                    setCustomAmount(String(def));
                  }}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-bold bg-slate-50 text-slate-900"
                >
                  <option value={1}>1 Month (Current Cycle)</option>
                  <option value={2}>2 Months (+2 Cycles)</option>
                  <option value={3}>3 Months (+3 Cycles)</option>
                  <option value={4}>4 Months (+4 Cycles)</option>
                  <option value={6}>6 Months (Half Year)</option>
                  <option value={12}>12 Months (Full Year)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Paying Amount (₹):
                  </label>
                  <span className="text-[10px] text-indigo-600 font-semibold">(Custom allowed)</span>
                </div>
                <input
                  type="number"
                  required
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 text-sm font-black text-emerald-700 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {(collectStudent.balanceDue || 0) > 0 
                    ? `Pending Balance Due: ${formatINR(collectStudent.balanceDue!)}`
                    : `Standard Fee: ${formatINR(collectStudent.monthlyFee * collectMonths)} (${collectMonths} Month)`}
                </span>
              </div>

              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="fullSettlementToggle"
                  checked={isFullSettlement}
                  onChange={(e) => setIsFullSettlement(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="fullSettlementToggle" className="text-[11px] text-slate-700 font-semibold cursor-pointer select-none">
                  Discount / Concession (Bacha balance due na bane)
                </label>
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

      {/* Modal: Vacant Seats */}
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

      {/* Modal: History */}
      {historyStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Payment History & Receipts</h3>
                <p className="text-xs text-slate-500">
                  Student: <strong className="text-slate-800">{historyStudent.name}</strong> ({historyStudent.shift === "Random" || historyStudent.seatNo === "FLOATING" ? "Floating Seat" : `Seat ${historyStudent.seatNo}`})
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
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-900">{formatINR(item.amount_paid)}</span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                            {item.payment_mode}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                          Date: {formatDate(item.payment_date)} · {item.months_count} Month(s) Duration
                        </p>
                        {item.paid_until_date && (
                          <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                            Valid Till: {formatDate(item.paid_until_date)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Download this Receipt again"
                          onClick={() => {
                            if (!historyStudent) return;
                            downloadReceiptPDF(
                              currentLib?.name || "LIBRARY MANAGEMENT",
                              currentLib?.owner_name || "Manager",
                              currentLib?.phone || "9301530783",
                              historyStudent,
                              item.amount_paid,
                              item.months_count,
                              item.payment_mode,
                              item.payment_date,
                              item.paid_until_date || undefined
                            );
                          }}
                          className="rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1.5 text-xs font-bold transition flex items-center gap-1 shadow-xs whitespace-nowrap active:scale-95"
                        >
                          <span>📥 PDF</span>
                        </button>
                        <button
                          type="button"
                          title="Delete this payment entry"
                          onClick={() => handleDeletePaymentRecord(item.id)}
                          className="rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 px-2.5 py-1.5 text-xs font-bold transition active:scale-95"
                        >
                          🗑️
                        </button>
                      </div>
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