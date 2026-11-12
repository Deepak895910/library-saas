import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const WA_SERVER_URL = "https://whatsapp-crm-service.onrender.com/api/send-message?secret=89599301";

// Safe Target Library (Apex Study Library)
const DEFAULT_TARGET_LIBRARY_ID = "7d8786fc-c3c2-42d7-b920-e925d750c8c5";

// Admin Phone for Audit Reports
const ADMIN_REPORT_PHONE = "8959102057";

// Helper: Dates parsing supporting ISO, DD/MM/YYYY, "04 Nov 2026"
function parseSafeDate(dateVal: any): Date | null {
  if (!dateVal || dateVal === "-" || dateVal === "N/A") return null;

  let parsed = new Date(dateVal);
  if (!isNaN(parsed.getTime())) {
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  const monthsMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const parts = String(dateVal).replace(/,/g, "").trim().split(/\s+/);
  if (parts.length >= 3) {
    const day = parseInt(parts[0], 10);
    const monthKey = parts[1].slice(0, 3).toLowerCase();
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && monthKey in monthsMap && !isNaN(year)) {
      parsed = new Date(year, monthsMap[monthKey], day);
      if (!isNaN(parsed.getTime())) {
        parsed.setHours(0, 0, 0, 0);
        return parsed;
      }
    }
  }

  if (String(dateVal).includes("/")) {
    const slashParts = String(dateVal).split("/");
    if (slashParts.length === 3) {
      const day = parseInt(slashParts[0], 10);
      const month = parseInt(slashParts[1], 10) - 1;
      const year = parseInt(slashParts[2], 10);
      parsed = new Date(year, month, day);
      if (!isNaN(parsed.getTime())) {
        parsed.setHours(0, 0, 0, 0);
        return parsed;
      }
    }
  }

  return null;
}

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isLive = searchParams.get("live") === "true";
    const isDryRun = !isLive;
    const targetLibraryId = searchParams.get("library_id") || DEFAULT_TARGET_LIBRARY_ID;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    // 1. Fetch library profile along with auto_reminder_enabled setting
    const { data: libData, error: libErr } = await (supabase as any)
      .from("libraries")
      .select("id, name, phone, auto_reminder_enabled")
      .eq("id", targetLibraryId)
      .single();

    if (libErr || !libData) {
      return NextResponse.json({ success: false, error: "Library not found" }, { status: 404 });
    }

    const libName = libData?.name || "Apex Study Library";
    const contact = libData?.phone || "9301530783";

    // 🛑 2. CHECK DASHBOARD THREE-DOT TOGGLE: Agar Admin ne button OFF kiya hai toh turant stop karein
    if (libData.auto_reminder_enabled === false) {
      const offReport = `*⏸️ LIBRARY REMINDER STATUS*\n--------------------------------\n*लाइब्रेरी:* ${libName}\n*स्थिति:* Dashboard Three-Dot Toggle से Auto Reminders बंद (PAUSED) हैं।\n\nकोई मैसेज ट्रिगर नहीं किया गया।`;
      
      // Admin ko intimation bhej dein taaki pata rahe ki cron aaya tha par button OFF tha
      await sendWhatsAppAlert(ADMIN_REPORT_PHONE, offReport);

      return NextResponse.json({
        success: true,
        message: "Auto reminders are switched OFF from admin three-dot menu.",
        auto_reminder_enabled: false,
        dispatchedCount: 0,
      });
    }

    // 3. Fetch active students of target library
    const { data: students, error: studentErr } = await (supabase as any)
      .from("students")
      .select("*")
      .eq("library_id", targetLibraryId)
      .neq("status", "left");

    if (studentErr || !students) {
      return NextResponse.json({ success: false, error: studentErr?.message });
    }

    let dispatchedCount = 0;
    const auditLogs: any[] = [];
    const reportDispatchedList: Array<{ name: string; phone: string; type: string; days: number }> = [];

    for (const student of (students as any[])) {
      const balance = Number(student.balance_due || 0);

      // RULE 0: INDIVIDUAL REMINDER PAUSE
      // Pause remains active THROUGH the selected date and resumes the next day.
      const pauseUntil = student.reminder_pause_until
        ? String(student.reminder_pause_until).slice(0, 10)
        : null;
      if (pauseUntil && pauseUntil >= todayStr) {
        auditLogs.push({
          name: student.name,
          action: "SKIPPED",
          reason: `Individual reminders paused through ${pauseUntil}`,
        });
        continue;
      }

      // RULE 1: SAFEGUARD - Paid student with 0 balance will NEVER get a message
      if (student.status === "paid" && balance <= 0) {
        auditLogs.push({ name: student.name, action: "SKIPPED", reason: "Status is PAID & Balance is 0" });
        continue;
      }

      // RULE 2: FIRST MONTH CHECK - Joining ko 28 din se kam hue hain toh skip
      const admissionRaw = student.admission_date || student.joining_date || student.created_at;
      if (admissionRaw) {
        const admissionDate = parseSafeDate(admissionRaw);
        if (admissionDate) {
          const daysJoined = Math.floor((today.getTime() - admissionDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysJoined < 28) {
            auditLogs.push({
              name: student.name,
              action: "SKIPPED",
              reason: `First Month Student (Joined only ${daysJoined} days ago)`
            });
            continue;
          }
        }
      }

      // RULE 3: DAILY DUPLICATE LOCK - Already sent today
      if (student.last_reminder_date === todayStr) {
        auditLogs.push({ name: student.name, action: "SKIPPED", reason: "Already received reminder today" });
        continue;
      }

      // RULE 4: DUE DATE VALIDATION
      const due = parseSafeDate(student.due_date);
      if (!due) {
        auditLogs.push({ name: student.name, action: "SKIPPED", reason: `Invalid due_date (${student.due_date})` });
        continue;
      }

      const diffMs = today.getTime() - due.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      // RULE 5: FUTURE DATE - Due date aayi nahi hai
      if (diffDays < 0) {
        auditLogs.push({ name: student.name, action: "SKIPPED", reason: `Due date in future (${Math.abs(diffDays)} days left)` });
        continue;
      }

      // RULE 6: OVERDUE CAP (> 7 din purane overdue ko auto-message nahi, manual contact karein)
      if (diffDays > 7) {
        auditLogs.push({ name: student.name, action: "SKIPPED", reason: `Overdue > 7 days (${diffDays} days late) - Requires Manual Contact` });
        continue;
      }

      // Message Drafting
      const seatInfo = student.seat_no === "FLOATING" ? "Floating Slot" : (student.seat_no || "N/A");
      const amount = balance > 0 ? balance : (student.monthly_fee || 600);
      const formattedAmt = `₹${amount}`;

      let msg = "";
      let reminderType = "";

      if (diffDays === 0) {
        reminderType = "Fee Reminder (Day 1 - Due Today)";
        msg = `*📚 ${libName} - मासिक फीस स्मरण (Day 1)*\n--------------------------------\n*विद्यार्थी का नाम:* ${student.name}\n*सीट नंबर:* ${seatInfo}\n*अंतिम तिथि:* ${student.due_date}\n*फीस राशि:* ${formattedAmt}\n\nनमस्ते ${student.name} जी, आशा है आपकी पढ़ाई अच्छी चल रही होगी। आपकी इस माह की लाइब्रेरी फीस का समय हो चुका है। कृपया समय मिलने पर अपनी फीस जमा कराएं ताकि आपकी सीट निर्बाध जारी रहे।\n\n📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else if (diffDays === 1) {
        reminderType = "Fee Reminder (Day 2 - 1 Day Late)";
        msg = `*⏳ ${libName} - फीस नवीनीकरण सूचना (Day 2)*\n--------------------------------\n*विद्यार्थी का नाम:* ${student.name}\n*सीट नंबर:* ${seatInfo}\n*बकाया राशि:* ${formattedAmt}\n\nनमस्ते ${student.name} जी, एक विनम्र स्मरण कि आपकी लाइब्रेरी फीस कल देय थी। यदि आपने पहले ही भुगतान कर दिया है तो कृपया हमें सूचित करें, अन्यथा आज समय निकालकर फीस रिन्यू कराने का कष्ट करें।\n\n📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else if (diffDays === 2 || diffDays === 3) {
        reminderType = `Fee Reminder (Day ${diffDays + 1} - ${diffDays} Days Late)`;
        msg = `*📖 ${libName} - विनम्र स्मरण (Day 3)*\n--------------------------------\n*विद्यार्थी का नाम:* ${student.name}\n*सीट नंबर:* ${seatInfo}\n*बकाया राशि:* ${formattedAmt}\n\nनमस्ते ${student.name} जी, आपकी लाइब्रेरी फीस पिछले कुछ दिनों से लंबित है। अध्ययन व्यवस्था और सीट प्रबंधन को सुचारु बनाए रखने हेतु कृपया आज अपनी फीस जमा कराकर सहयोग प्रदान करें।\n\n📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else if (diffDays === 4) {
        reminderType = "Fee Reminder (Day 5 - 4 Days Late)";
        msg = `*ℹ️ ${libName} - सीट पुष्टि अनुरोध (Day 4)*\n--------------------------------\n*विद्यार्थी का नाम:* ${student.name}\n*सीट नंबर:* ${seatInfo}\n*बकाया राशि:* ${formattedAmt}\n\nनमस्ते ${student.name} जी, आपकी मासिक फीस पिछले 4 दिनों से बकाया चल रही है। नए विद्यार्थियों के आग्रह के कारण कृपया हमें यह अवगत कराएं कि क्या आप इसी सीट (${seatInfo}) को आगे जारी रखना चाहते हैं? \n\nकृपया आज संपर्क कर अपनी सीट सुनिश्चित करा लें।\n\n📞 *हेल्पडेस्क / UPI:* ${contact}`;
      } else {
        reminderType = `Fee Reminder (Day ${diffDays + 1} - ${diffDays} Days Late)`;
        msg = `*📩 ${libName} - विशेष अनुरोध (Day 5)*\n--------------------------------\n*विद्यार्थी का नाम:* ${student.name}\n*सीट नंबर:* ${seatInfo}\n*बकाया राशि:* ${formattedAmt}\n\nनमस्ते ${student.name} जी, आपकी लाइब्रेरी फीस 5 दिनों से लंबित है। सीट की निरंतरता बनाए रखने के लिए आपसे सविनय निवेदन है कि आज प्रबंधन से संपर्क कर अपनी स्थिति स्पष्ट करने की कृपा करें, ताकि हम आपकी सीट सुरक्षित रख सकें।\n\n📞 *हेल्पडेस्क / संपर्क:* ${contact}`;
      }

      // Add a clear label and payment disclaimer to every automated student reminder.
      msg = `*AUTO REMINDER*\n\n${msg}\n\n_यदि आपने फीस भर दी है, तो कृपया इस संदेश को अनदेखा करें।_`;

      reportDispatchedList.push({
        name: student.name,
        phone: student.phone,
        type: reminderType,
        days: diffDays
      });

      // DRY RUN MODE: Test mode mein student ko send nahi hoga
      if (isDryRun) {
        auditLogs.push({ name: student.name, action: "WOULD_SEND (Dry Run Test)", type: reminderType, diffDays });
        dispatchedCount++;
        continue;
      }

      // LIVE MODE: Real dispatch to student
      await sendWhatsAppAlert(student.phone, msg);

      // Lock reminder for today
      await (supabase as any)
        .from("students")
        .update({ last_reminder_date: todayStr })
        .eq("id", student.id);

      // DB Log entry
      await (supabase as any)
        .from("whatsapp_message_logs")
        .insert([
          {
            student_id: student.id,
            student_name: student.name,
            phone: student.phone,
            message_type: reminderType,
            message_body: msg,
            status: "sent",
          },
        ]);

      auditLogs.push({ name: student.name, action: "SENT", type: reminderType });
      dispatchedCount++;
      await new Promise((r) => setTimeout(r, 1200));
    }

    // 4. Admin WhatsApp Report on 8959102057
    let adminReportText = `*📊 LIBRARY REMINDER AUDIT REPORT*\n`;
    adminReportText += `*लाइब्रेरी:* ${libName}\n`;
    adminReportText += `*तारीख:* ${todayStr}\n`;
    adminReportText += `*मोड:* ${isLive ? "🟢 LIVE DISPATCH" : "🟡 TESTING (DRY RUN - No student messaged)"}\n`;
    adminReportText += `*Dashboard Auto-Reminder Toggle:* ON\n`;
    adminReportText += `*कुल जाँचे गए छात्र:* ${students.length}\n`;
    adminReportText += `*शॉर्टलिस्टेड / भेजे गए:* ${dispatchedCount}\n`;
    adminReportText += `--------------------------------\n`;

    if (reportDispatchedList.length === 0) {
      adminReportText += `\n✅ आज किसी भी छात्र को रिमाइंडर भेजने की आवश्यकता नहीं है।\n`;
    } else {
      adminReportText += `\n*छात्रों की सूची:*\n`;
      reportDispatchedList.forEach((item, idx) => {
        adminReportText += `${idx + 1}. *${item.name}* (${item.phone})\n   ↳ प्रकार: ${item.type} [Due se ${item.days} din]\n`;
      });
    }

    adminReportText += `\n--------------------------------\n_यह ऑटोमेटेड रिपोर्ट सिस्टम द्वारा 8959102057 पर प्रेषित की गई है।_`;

    await sendWhatsAppAlert(ADMIN_REPORT_PHONE, adminReportText);

    return NextResponse.json({
      success: true,
      mode: isLive ? "LIVE" : "TESTING_DRY_RUN",
      auto_reminder_enabled: true,
      adminReportSentTo: ADMIN_REPORT_PHONE,
      library: libName,
      totalStudentsChecked: students.length,
      dispatchedCount,
      reportList: reportDispatchedList,
      logs: auditLogs,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal error" }, { status: 500 });
  }
}