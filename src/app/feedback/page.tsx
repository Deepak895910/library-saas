"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function FeedbackForm() {
  const searchParams = useSearchParams();
  const libId = searchParams.get("lib_id") || "";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [seatNo, setSeatNo] = useState("");
  const [category, setCategory] = useState("Cleaning");
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!libId) {
      alert("Invalid Library link! QR dobara scan karein.");
      return;
    }
    setLoading(true);

    const { error } = await supabase.from("library_feedbacks").insert([
      {
        library_id: libId,
        student_name: name.trim(),
        phone: phone.trim(),
        seat_no: seatNo.trim().toUpperCase(),
        rating,
        category,
        message: message.trim(),
      },
    ]);

    setLoading(false);
    if (!error) {
      setSubmitted(true);
    } else {
      alert("Error: " + error.message);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-6 rounded-3xl shadow-xl text-center space-y-3 border border-slate-100">
          <span className="text-5xl"></span>
          <h2 className="text-lg font-black text-slate-900">Feedback Prapt Hua!</h2>
          <p className="text-xs text-slate-500">
            Aapka sujhav / shikayat library admin tak pahunch gayi hai. Hamari seva behtar banane ke liye dhanyawad!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <form onSubmit={handleSubmit} className="max-w-md w-full bg-white p-6 rounded-3xl shadow-xl space-y-4 border border-slate-200/80">
        <div>
          <h2 className="text-lg font-black text-slate-900"> Library Feedback & Grievance</h2>
          <p className="text-xs text-slate-500 mt-1">
            Library suvidha ko behtar banane ke liye apni samasya ya sujhav yahan likhein.
          </p>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Aapka Naam:</label>
            <input
              required
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Mobile No:</label>
              <input
                required
                placeholder="10 Digits"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 outline-none"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Seat No:</label>
              <input
                placeholder="e.g. A12"
                value={seatNo}
                onChange={(e) => setSeatNo(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2.5 font-mono uppercase"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Vishy (Category):</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 font-semibold bg-white"
            >
              <option value="Cleaning">Safai / Hygiene </option>
              <option value="AC/Cooling">AC / Fan / Garmi </option>
              <option value="Noise">Awaj / Shanti (Silence) </option>
              <option value="Wi-Fi">Wi-Fi / Internet Problem </option>
              <option value="Lighting">Lights / Desk Issue </option>
              <option value="General">Any Other Suggestion </option>
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Rating:</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setRating(star)}
                  className={`text-2xl p-1 transition ${rating >= star ? "scale-110" : "grayscale opacity-30"}`}
                >
                  
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Detail Samasya / Sujhav:</label>
            <textarea
              required
              rows={3}
              placeholder="Apni samasya yahan detail me likhein..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs transition active:scale-95 shadow-md shadow-indigo-500/20"
        >
          {loading ? "Submitting..." : "Feedback Bhejein"}
        </button>
      </form>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading form...</div>}>
      <FeedbackForm />
    </Suspense>
  );
}
