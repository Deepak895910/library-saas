import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// SPECIFIC TEST LIBRARY ID
const TARGET_LIBRARY_ID = "5630e970-a4cd-4d55-8e4f-e907cdf12267";

function parseDueDate(dateVal: any): Date | null {
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

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    // 1. Fetch library details for confirmation
    const { data: libData } = await (supabase as any)
      .from("libraries")
      .select("id, name, phone")
      .eq("id", TARGET_LIBRARY_ID)
      .single();

    // 2. Fetch students belonging ONLY to this library
    const { data: students, error: studentErr } = await (supabase as any)
      .from("students")
      .select("*")
      .eq("library_id", TARGET_LIBRARY_ID)
      .neq("status", "left");

    if (studentErr || !students) {
      return NextResponse.json({ success: false, error: studentErr?.message });
    }

    const dryRunResults: any[] = [];

    for (const student of (students as any[])) {
      const balance = Number(student.balance_due || 0);

      // Rule 1: Paid & No balance due
      if (student.status === "paid" && balance <= 0) {
        dryRunResults.push({
          name: student.name,
          phone: student.phone,
          status: student.status,
          dueDate: student.due_date,
          action: "SKIPPED",
          reason: "Status is PAID & Balance is 0"
        });
        continue;
      }

      // Rule 2: Already sent today
      if (student.last_reminder_date === todayStr) {
        dryRunResults.push({
          name: student.name,
          phone: student.phone,
          status: student.status,
          dueDate: student.due_date,
          action: "SKIPPED",
          reason: "Already received reminder today"
        });
        continue;
      }

      // Rule 3: Due date parsing
      const due = parseDueDate(student.due_date);
      if (!due) {
        dryRunResults.push({
          name: student.name,
          phone: student.phone,
          status: student.status,
          dueDate: student.due_date,
          action: "SKIPPED",
          reason: "Invalid Date Format"
        });
        continue;
      }

      const diffMs = today.getTime() - due.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      // Rule 4: Future date
      if (diffDays < 0) {
        dryRunResults.push({
          name: student.name,
          phone: student.phone,
          status: student.status,
          dueDate: student.due_date,
          action: "SKIPPED",
          reason: `Future Date (${Math.abs(diffDays)} days remaining)`
        });
        continue;
      }

      // Qualifies for reminder
      dryRunResults.push({
        name: student.name,
        phone: student.phone,
        seat: student.seat_no,
        dueDate: student.due_date,
        status: student.status,
        balanceDue: balance > 0 ? balance : (student.monthly_fee || 600),
        action: "WOULD_SEND_MESSAGE",
        messageType: `Day ${diffDays + 1}`,
        note: "DRY-RUN PREVIEW ONLY (No real message sent)"
      });
    }

    return NextResponse.json({
      success: true,
      mode: "DRY_RUN (ZERO MESSAGES SENT)",
      libraryName: libData?.name || "Target Library",
      libraryId: TARGET_LIBRARY_ID,
      totalStudentsInLibrary: students.length,
      wouldSendCount: dryRunResults.filter(r => r.action === "WOULD_SEND_MESSAGE").length,
      results: dryRunResults
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal error" }, { status: 500 });
  }
}