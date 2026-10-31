"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Shift = "Morning" | "Evening" | "Full Day" | "Random";

const WA_SERVER_URL = "https://whatsapp-crm-service.onrender.com/api/send-message?secret=89599301";

// Helper function WhatsApp message deliver karne ke liye
async function sendWhatsAppAlert(phone: string, message: string) {
  try {
    let clean = phone.replace(/\D/g, "").slice(-10);
    if (clean.length === 10) {
      clean = "91" + clean;
    }
    await fetch(WA_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: clean, message }),
    });
  } catch (err) {
    console.error("WhatsApp trigger error:", err);
  }
}

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

function InquiryContent() {
  const searchParams = useSearchParams();
  const libId = searchParams.get("lib_id");

  const [libName, setLibName] = useState("Library Management");
  const [libPhone, setLibPhone] = useState("9301530783");
  const [loadingLib, setLoadingLib] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shift, setShift] = useState<Shift>("Morning");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [vacantSeats, setVacantSeats] = useState<string[]>([]);
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [savingSeat, setSavingSeat] = useState(false);

  useEffect(() => {
    async function fetchLibInfo() {
      if (!libId) {
        setLoadingLib(false);
        return;
      }
      const { data } = await supabase
        .from("libraries")
        .select("name, phone")
        .eq("id", libId)
        .maybeSingle();

      if (data) {
        setLibName(data.name || "Library Management");
        setLibPhone(data.phone || "9301530783");
      }
      setLoadingLib(false);
    }
    fetchLibInfo();
  }, [libId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!libId) {
      alert("Invalid QR Code Link! Library ID nahi mili.");
      return;
    }

    const cleanPhone = phone.replace(/\D/g, "").slice(-10);
    if (cleanPhone.length !== 10) {
      alert("Kripya 10 digit ka valid mobile number dalein!");
      return;
    }

    setSubmitting(true);
    try {
      const { data: insertedInq, error: inqErr } = await supabase
        .from("inquiries")
        .insert([
          {
            library_id: libId,
            name: name.trim(),
            phone: cleanPhone,
            interested_shift: shift,
            notes: notes.trim(),
            status: "pending",
          },
        ])
        .select("id")
        .single();

      if (inqErr) throw inqErr;
      if (insertedInq) {
        setInquiryId(insertedInq.id);
      }

      // ─── AUTOMATED WHATSAPP TRIGGERS ─────────────────────────
      // 1. Student Confirmation Message (Hindi)
      const studentMsg = `*📚 स्वागत है! लाइब्रेरी इन्क्वायरी कन्फर्मेशन*
--------------------------------
*नमस्ते ${name.trim()},*
${libName} में आपकी इन्क्वायरी सफलतापूर्वक दर्ज कर ली गई है।

*विवरण (Details):*
• *शिफ्ट:* ${shift}
• *संपर्क:* ${cleanPhone}

सीट उपलब्धता देखने के लिए स्क्रीन पर अपनी पसंदीदा सीट चुनें या हमसे संपर्क करें।

📞 *हेल्पलाइन:* ${libPhone}`;

      // 2. Admin Alert Message (Hindi)
      const adminMsg = `*🔔 NEW INQUIRY ALERT (नई इन्क्वायरी)*
--------------------------------
*लाइब्रेरी:* ${libName}
*विद्यार्थी:* ${name.trim()}
*मोबाइल:* ${cleanPhone}
*शिफ्ट:* ${shift}
*नोट्स:* ${notes.trim() || "N/A"}
*तारीख:* ${new Date().toLocaleDateString("en-IN")}

कृपया छात्र से संपर्क करें!`;

      // Background me WhatsApp messages dispatch karein
      sendWhatsAppAlert(cleanPhone, studentMsg);
      sendWhatsAppAlert(libPhone, adminMsg);

      const { data: libData } = await supabase
        .from("libraries")
        .select("seats_config")
        .eq("id", libId)
        .maybeSingle();

      const allSeats = parseCustomSeats(libData?.seats_config || "A1-A25, B1-B25");

      const { data: activeStudents } = await supabase
        .from("students")
        .select("seat_no, shift, status")
        .eq("library_id", libId)
        .neq("status", "left");

      const bookedSet = new Set(
        (activeStudents || [])
          .filter((s: any) => {
            if (s.shift === "Random" || s.seat_no === "FLOATING" || s.seat_no === "VACATED") return false;
            if (s.shift === "Full Day" || shift === "Full Day") return true;
            return s.shift === shift;
          })
          .map((s: any) => s.seat_no.trim().toUpperCase())
      );

      const freeSeats = allSeats.filter((st) => !bookedSet.has(st.trim().toUpperCase()));
      setVacantSeats(freeSeats);
      setSelectedSeat(null);
      setSubmitted(true);
    } catch (err: any) {
      alert("Error: " + (err.message || "Something went wrong"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSelectSeat(seatNo: string) {
    if (!inquiryId || savingSeat) return;

    setSelectedSeat(seatNo);
    setSavingSeat(true);

    try {
      const updatedNotes = notes
        ? `${notes} | Interested Seat: #${seatNo}`
        : `Interested Seat: #${seatNo}`;

      await supabase
        .from("inquiries")
        .update({
          interested_seat: seatNo,
          notes: updatedNotes,
        })
        .eq("id", inquiryId);

      // Preferred Seat chunne par Admin ko chota alert
      const seatChosenMsg = `*📌 SEAT SELECTION UPDATE*
--------------------------------
*विद्यार्थी:* ${name.trim()} (${phone})
*पसंदीदा सीट:* #${seatNo} (${shift} Shift)`;

      sendWhatsAppAlert(libPhone, seatChosenMsg);
    } catch (err) {
      console.warn("Seat interest update error:", err);
    } finally {
      setSavingSeat(false);
    }
  }

  if (loadingLib) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-sm">
        Loading Library Portal...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-6 text-center">
          <span className="text-3xl block mb-1">📚</span>
          <h1 className="text-xl font-black tracking-tight">{libName.toUpperCase()}</h1>
          <p className="text-xs text-indigo-100 mt-1">Student Self-Admission Inquiry</p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Aapka Poora Naam:</label>
              <input
                required
                type="text"
                placeholder="Enter Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Mobile / WhatsApp No:</label>
              <input
                required
                type="tel"
                placeholder="10 Digits Mobile Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-medium font-mono outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Kaunsi Shift Chahiye?</label>
              <select
                value={shift}
                onChange={(e) => setShift(e.target.value as Shift)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="Morning">Morning Shift (Subah)</option>
                <option value="Evening">Evening Shift (Shaam)</option>
                <option value="Full Day">Full Day (Pura Din)</option>
                <option value="Random">Random / Flexible Slot</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Message / Notes (Optional):</label>
              <textarea
                placeholder="e.g. Kisi specific exam ki taiyari ya trial demo slot"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-medium outline-none h-20 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs shadow-md transition active:scale-95 disabled:opacity-50"
            >
              {submitting ? "Checking Availability & Notifying..." : "Check Available Seats & Submit 🚀"}
            </button>
          </form>
        ) : (
          <div className="p-6 text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 text-2xl font-bold rounded-full flex items-center justify-center mx-auto">
              ✓
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Inquiry Received, {name}!</h2>
              <p className="text-xs text-slate-500 mt-1">
                Aapka record library desk par save ho gaya hai aur WhatsApp par confirmation bhej diya gaya hai.
              </p>
            </div>

            {/* Shift Availability Box */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Current Seat Availability ({shift} Shift):
              </span>

              {vacantSeats.length > 0 ? (
                <div>
                  <p className="text-xs font-extrabold text-slate-800 mb-2">
                    Neeche di gayi kisi bhi seat par tap karke apni <strong className="text-indigo-600">Preferred Seat</strong> select karein:
                  </p>
                  
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
                    {vacantSeats.map((seat) => {
                      const isChosen = selectedSeat === seat;
                      return (
                        <button
                          key={seat}
                          type="button"
                          onClick={() => handleSelectSeat(seat)}
                          className={`p-2 rounded-xl text-center font-mono font-black text-xs transition duration-150 active:scale-95 border ${
                            isChosen
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/30"
                              : "bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300 shadow-2xs"
                          }`}
                        >
                          #{seat}
                          {isChosen && <span className="block text-[9px] font-sans font-bold leading-none mt-0.5">Selected</span>}
                        </button>
                      );
                    })}
                  </div>

                  {selectedSeat ? (
                    <div className="mt-3 p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-bold flex items-center justify-between">
                      <span>✓ Aapne Seat <strong>#{selectedSeat}</strong> select ki hai!</span>
                      <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full">Saved</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-2">
                      * Apni pasand ki seat par tap karein taaki admin ko pata chal sake.
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-2 space-y-2">
                  <span className="inline-block bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-3 py-1 rounded-lg">
                    ⚠️ Is Shift me Fixed Seats Full Hain!
                  </span>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-left">
                    <p className="text-xs font-bold text-purple-900">💡 Random / Flexible Slot Available:</p>
                    <p className="text-[11px] text-purple-700 mt-0.5">
                      Aap <strong>Random / Flexible Slot</strong> me admission le sakte hain, jisme aapko daily open vacant seats allot hoti hain.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* CALL MANAGEMENT & WHATSAPP BUTTONS */}
            <div className="space-y-2 pt-1">
              <a
                href={`tel:${libPhone}`}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm active:scale-95"
              >
                <span>📞 Call Management ({libPhone})</span>
              </a>

              <a
                href={`https://wa.me/91${libPhone}?text=${encodeURIComponent(
                  `Namaste, maine ${libName} me ${name} ke naam se self-inquiry submit ki hai (${shift} Shift). ${
                    selectedSeat ? `Maine Seat #${selectedSeat} select ki hai.` : "Mujhe admission confirm karna hai."
                  }`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-xs active:scale-95"
              >
                💬 WhatsApp Chat with Management
              </a>
            </div>

            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setName("");
                setPhone("");
                setNotes("");
                setSelectedSeat(null);
                setInquiryId(null);
              }}
              className="text-xs text-slate-400 hover:text-slate-600 font-bold block mx-auto pt-2"
            >
              Fill Another Inquiry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 text-xs">Loading Inquiry Form...</div>}>
      <InquiryContent />
    </Suspense>
  );
}