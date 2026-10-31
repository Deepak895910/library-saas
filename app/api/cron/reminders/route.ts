import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const WA_SERVER_URL = "https://whatsapp-crm-service.onrender.com/api/send-message?secret=89599301";

async function sendWhatsAppAlert(phone: string, message: string) {
  try {
    let clean = phone.replace(/\D/g, "").slice(-10);
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

    // Sabhi active students jinka status left nahi hai
    const { data: students, error } = await supabase
      .from("students")
      .select("*, libraries(name, phone)")
      .neq("status", "left");

    if (error || !students) {
      return NextResponse.json({ success: false, error: error?.message });
    }

    let dispatchedCount = 0;

    for (const student of students) {
      const balance = Number(student.balance_due || 0);
      const isPaid = student.status === "paid" && balance === 0;
      if (isPaid) continue; // Fee clear hai toh skip karein

      // Due date calculation
      let diffDays = 0;
      if (student.due_date && student.due_date !== "-") {
        let due = new Date(student.due_date);
        if (isNaN(due.getTime())) {
          const monthsMap: Record<string, number> = {
            jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
            jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
          };
          const parts = student.due_date.replace(/,/g, "").split(/\s+/);
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

      // Sirf unko bhejna hai jinki due date aaj hai ya overdue ho chuka hai (Day 1 se 5+)
      if (diffDays < 0) continue;

      const libName = student.libraries?.name || "लाइब्रेरी";
      const contact = student.libraries?.phone || "9301530783";
      const seatInfo = student.seat_no === "FLOATING" ? "Floating Slot" : student.seat_no;
      const amount = balance > 0 ? balance : student.monthly_fee;
      const formattedAmt = `₹${amount}`;

      let msg = "";

      if (diffDays === 0) {
        msg = `*📚 ${libName} - मासिक फीस स्मरण (Day 1)*
--------------------------------
*विद्यार्थी का नाम:* ${student.name}
*सीट नंबर:* ${seatInfo}
*अंतिम तिथि:* ${student.due_date}
*फीस राशि:* ${formattedAmt}

नमस्ते ${student.name} जी, आशा है आपकी पढ़ाई अच्छी चल रही होगी। आपकी इस माह की लाइब्रेरी फीस का समय हो चुका है। कृपया समय मिलने पर अपनी फीस जमा कराएं ताकि आपकी सीट निर्बाध जारी रहे।

📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else if (diffDays === 1) {
        msg = `*⏳ ${libName} - फीस नवीनीकरण सूचना (Day 2)*
--------------------------------
*विद्यार्थी का नाम:* ${student.name}
*सीट नंबर:* ${seatInfo}
*बकाया राशि:* ${formattedAmt}

नमस्ते ${student.name} जी, एक विनम्र स्मरण कि आपकी लाइब्रेरी फीस कल देय थी। यदि आपने पहले ही भुगतान कर दिया है तो कृपया हमें सूचित करें, अन्यथा आज समय निकालकर फीस रिन्यू कराने का कष्ट करें।

📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else if (diffDays === 2 || diffDays === 3) {
        msg = `*📖 ${libName} - विनम्र स्मरण (Day 3)*
--------------------------------
*विद्यार्थी का नाम:* ${student.name}
*सीट नंबर:* ${seatInfo}
*बकाया राशि:* ${formattedAmt}

नमस्ते ${student.name} जी, आपकी लाइब्रेरी फीस पिछले कुछ दिनों से लंबित है। अध्ययन व्यवस्था और सीट प्रबंधन को सुचारु बनाए रखने हेतु कृपया आज अपनी फीस जमा कराकर सहयोग प्रदान करें।

📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else if (diffDays === 4) {
        msg = `*ℹ️ ${libName} - सीट पुष्टि अनुरोध (Day 4)*
--------------------------------
*विद्यार्थी का नाम:* ${student.name}
*सीट नंबर:* ${seatInfo}
*बकाया राशि:* ${formattedAmt}

नमस्ते ${student.name} जी, आपकी मासिक फीस पिछले 4 दिनों से बकाया चल रही है। नए विद्यार्थियों के आग्रह के कारण कृपया हमें यह अवगत कराएं कि क्या आप इसी सीट (${seatInfo}) को आगे जारी रखना चाहते हैं? 

कृपया आज संपर्क कर अपनी सीट सुनिश्चित करा लें।

📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else {
        msg = `*📩 ${libName} - विशेष अनुरोध (Day 5)*
--------------------------------
*विद्यार्थी का नाम:* ${student.name}
*सीट नंबर:* ${seatInfo}
*बकाया राशि:* ${formattedAmt}

नमस्ते ${student.name} जी, आपकी लाइब्रेरी फीस 5 दिनों से लंबित है। सीट की निरंतरता बनाए रखने के लिए आपसे सविनय निवेदन है कि आज प्रबंधन से संपर्क कर अपनी स्थिति स्पष्ट करने की कृपा करें, ताकि हम आपकी सीट सुरक्षित रख सकें।

📞 *हेल्पडेस्क / संपर्क:* ${contact}`;
      }

      // WhatsApp dispatch (Safe interval)
      await sendWhatsAppAlert(student.phone, msg);
      dispatchedCount++;
      // Safe delay between messages
      await new Promise((r) => setTimeout(r, 2000));
    }

    return NextResponse.json({ success: true, count: dispatchedCount });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}