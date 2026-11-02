"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function FeedbackForm() {
  const searchParams = useSearchParams();
  const libId = searchParams.get("lib_id") || "";

  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [seatNumber, setSeatNumber] = useState("");
  const [category, setCategory] = useState("Hygiene & Cleanliness");
  const [rating, setRating] = useState(5);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!libId) {
      alert("Invalid QR code link. Please re-scan from the library desk.");
      return;
    }
    setLoading(true);

    const { error } = await supabase.from("library_feedbacks").insert([
      {
        library_id: libId,
        student_name: fullName.trim(),
        phone: phoneNumber.trim(),
        seat_no: seatNumber.trim().toUpperCase(),
        rating,
        category,
        message: description.trim(),
      },
    ]);

    setLoading(false);
    if (!error) {
      setSubmitted(true);
    } else {
      alert("Submission failed: " + error.message);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-900/5 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl text-center space-y-4 border border-slate-100">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto text-3xl font-bold shadow-inner">
            ✓
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Feedback Submitted</h2>
            <p className="text-sm text-slate-500 mt-1">
              Thank you for sharing your experience. Our management team will look into your request shortly.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setFullName("");
              setPhoneNumber("");
              setSeatNumber("");
              setDescription("");
              setRating(5);
            }}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition"
          >
            Submit Another Response
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 flex items-center justify-center p-4 font-sans text-slate-900">
      <form
        onSubmit={handleSubmit}
        className="max-w-md w-full bg-white p-7 rounded-3xl shadow-2xl space-y-5 border border-slate-200/90 backdrop-blur-sm"
      >
        <div className="border-b border-slate-100 pb-4">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
            Student Support Desk
          </span>
          <h2 className="text-xl font-black text-slate-900 mt-2">Feedback & Grievance Portal</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Help us maintain a clean, peaceful, and study-friendly atmosphere.
          </p>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-800 block mb-1.5">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              required
              placeholder="e.g. Rahul Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-slate-900 font-medium placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-800 block mb-1.5">
                Phone Number <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="tel"
                maxLength={10}
                placeholder="10-digit Mobile"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-slate-900 font-medium placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-800 block mb-1.5">Seat / Desk No</label>
              <input
                placeholder="e.g. S-24"
                value={seatNumber}
                onChange={(e) => setSeatNumber(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-slate-900 font-medium font-mono uppercase placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-800 block mb-1.5">
              Issue Category <span className="text-rose-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-slate-900 font-semibold outline-none focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition"
            >
              <option value="Hygiene & Cleanliness">Hygiene & Cleanliness</option>
              <option value="Air Conditioning & Cooling">Air Conditioning & Cooling</option>
              <option value="Noise & Silence Discipline">Noise & Silence Discipline</option>
              <option value="Wi-Fi & Connectivity">Wi-Fi & Internet Connectivity</option>
              <option value="Desk Lighting & Power Sockets">Desk Lighting & Power Sockets</option>
              <option value="General Suggestion">General Suggestion</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-800 block mb-1.5">Overall Satisfaction Rating</label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 p-2 rounded-2xl w-fit">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setRating(star)}
                  className={`text-2xl transition-all duration-200 hover:scale-125 ${
                    rating >= star ? "text-amber-400 drop-shadow-sm" : "text-slate-300"
                  }`}
                >
                  ★
                </button>
              ))}
              <span className="text-[11px] font-bold text-slate-600 ml-2">
                {rating === 5 ? "Excellent" : rating >= 4 ? "Good" : rating >= 3 ? "Average" : "Needs Attention"}
              </span>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-800 block mb-1.5">
              Detailed Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Please describe the issue or your suggestion in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-slate-900 font-medium placeholder-slate-400 outline-none focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/10 transition resize-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold py-3.5 rounded-2xl text-xs transition duration-150 shadow-lg shadow-indigo-600/25 disabled:opacity-50"
        >
          {loading ? "Submitting..." : "Submit Feedback"}
        </button>
      </form>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-xs text-slate-400">Loading form...</div>}>
      <FeedbackForm />
    </Suspense>
  );
}