import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const WA_SERVER_URL = "https://whatsapp-crm-service.onrender.com/api/send-message?secret=89599301";

async function sendWhatsAppAlert(phone: any, message: string) {
  try {
    let clean = String(phone || "").replace(/\D/g, "").slice(-10);
    if (clean.length === 10) clean = "91" + clean;
    await fetch(WA_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: clean, message }),
    });
  } catch (err) {
    console.error("WhatsApp dispatch error:", err);
  }
}

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch students without direct join
    const { data: students, error: studentErr } = await (supabase as any)
      .from("students")
      .select("*")
      .neq("status", "left");

    if (studentErr || !students) {
      return NextResponse.json({ success: false, error: studentErr?.message });
    }

    // Fetch libraries separately to avoid schema relationship error
    const { data: libraries } = await (supabase as any)
      .from("libraries")
      .select("id, name, phone");

    const libraryMap = new Map();
    if (libraries) {
      libraries.forEach((lib: any) => {
        libraryMap.set(String(lib.id), lib);
      });
    }

    let dispatchedCount = 0;

    for (const student of (students as any[])) {
      const balance = Number(student.balance_due || 0);
      const isPaid = student.status === "paid" && balance === 0;
      if (isPaid) continue;

      let diffDays = 0;
      if (student.due_date && student.due_date !== "-") {
        let due = new Date(student.due_date);
        if (isNaN(due.getTime())) {
          const monthsMap: Record<string, number> = {
            jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
            jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
          };
          const parts = String(student.due_date).replace(/,/g, "").split(/\s+/);
          if (parts.length >= 3) {
            const day = parseInt(parts[0], 10);
            const monthKey = parts[1].slice(0, 3).toLowerCase();
            const year = parseInt(parts[2], 10);
            if (!isNaN(day) && (monthKey in monthsMap) && !isNaN(year)) {
              due = new Date(year, (monthsMap as any)[monthKey], day);
            }
          }
        }

        if (!isNaN(due.getTime())) {
          due.setHours(0, 0, 0, 0);
          const diffMs = today.getTime() - due.getTime();
          diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }
      }

      if (diffDays < 0) continue;

      const libObj = student.library_id ? libraryMap.get(String(student.library_id)) : null;
      const libName = libObj?.name || "लाइब्रेरी";
      const contact = libObj?.phone || "9301530783";
      const seatInfo = student.seat_no === "FLOATING" ? "Floating Slot" : (student.seat_no || "N/A");
      const amount = balance > 0 ? balance : (student.monthly_fee || 0);
      const formattedAmt = `₹${amount}`;

      let msg = "";

      if (diffDays === 0) {
        msg = `*📚 ${libName} - मासिक फीस स्मरण (Day 1)*\n--------------------------------\n*विद्यार्थी का नाम:* ${student.name}\n*सीट नंबर:* ${seatInfo}\n*अंतिम तिथि:* ${student.due_date}\n*फीस राशि:* ${formattedAmt}\n\nनमस्ते ${student.name} जी, आशा है आपकी पढ़ाई अच्छी चल रही होगी। आपकी इस माह की लाइब्रेरी फीस का समय हो चुका है। कृपया समय मिलने पर अपनी फीस जमा कराएं ताकि आपकी सीट निर्बाध जारी रहे।\n\n📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else if (diffDays === 1) {
        msg = `*⏳ ${libName} - फीस नवीनीकरण सूचना (Day 2)*\n--------------------------------\n*विद्यार्थी का नाम:* ${student.name}\n*सीट नंबर:* ${seatInfo}\n*बकाया राशि:* ${formattedAmt}\n\nनमस्ते ${student.name} जी, एक विनम्र स्मरण कि आपकी लाइब्रेरी फीस कल देय थी। यदि आपने पहले ही भुगतान कर दिया है तो कृपया हमें सूचित करें, अन्यथा आज समय निकालकर फीस रिन्यू कराने का कष्ट करें।\n\n📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else if (diffDays === 2 || diffDays === 3) {
        msg = `*📖 ${libName} - विनम्र स्मरण (Day 3)*\n--------------------------------\n*विद्यार्थी का नाम:* ${student.name}\n*सीट नंबर:* ${seatInfo}\n*बकाया राशि:* ${formattedAmt}\n\nनमस्ते ${student.name} जी, आपकी लाइब्रेरी फीस पिछले कुछ दिनों से लंबित है। अध्ययन व्यवस्था और सीट प्रबंधन को सुचारु बनाए रखने हेतु कृपया आज अपनी फीस जमा कराकर सहयोग प्रदान करें।\n\n📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else if (diffDays === 4) {
        msg = `*ℹ️ ${libName} - सीट पुष्टि अनुरोध (Day 4)*\n--------------------------------\n*विद्यार्थी का नाम:* ${student.name}\n*सीट नंबर:* ${seatInfo}\n*बकाया राशि:* ${formattedAmt}\n\nनमस्ते ${student.name} जी, आपकी मासिक फीस पिछले 4 दिनों से बकाया चल रही है। नए विद्यार्थियों के आग्रह के कारण कृपया हमें यह अवगत कराएं कि क्या आप इसी सीट (${seatInfo}) को आगे जारी रखना चाहते हैं? \n\nकृपया आज संपर्क कर अपनी सीट सुनिश्चित करा लें।\n\n📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else {
        msg = `*📩 ${libName} - विशेष अनुरोध (Day 5)*\n--------------------------------\n*विद्यार्थी का नाम:* ${student.name}\n*सीट नंबर:* ${seatInfo}\n*बकाया राशि:* ${formattedAmt}\n\nनमस्ते ${student.name} जी, आपकी लाइब्रेरी फीस 5 दिनों से लंबित है। सीट की निरंतरता बनाए रखने के लिए आपसे सविनय निवेदन है कि आज प्रबंधन से संपर्क कर अपनी स्थिति स्पष्ट करने की कृपा करें, ताकि हम आपकी सीट सुरक्षित रख सकें।\n\n📞 *हेल्पडेस्क / संपर्क:* ${contact}`;
      }

      await sendWhatsAppAlert(student.phone, msg);
      dispatchedCount++;
      await new Promise((r) => setTimeout(r, 2000));
    }

    return NextResponse.json({ success: true, count: dispatchedCount });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal error" }, { status: 500 });
  }
}