// FIXED VERSION - Naprawiony parser CSV do obsługi wszystkich sekcji shifts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { google } from "npm:googleapis@133";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const GMAIL_REDIRECT_URI = Deno.env.get("GMAIL_REDIRECT_URI")!;
const GMAIL_REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN")!;
const GMAIL_FILTER_LABEL_ID = Deno.env.get("GMAIL_FILTER_LABEL_ID")!;
const GMAIL_PROCESSED_LABEL_ID = Deno.env.get("GMAIL_PROCESSED_LABEL_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const gmailAuth = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI);
gmailAuth.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

const gmail = google.gmail({ version: "v1", auth: gmailAuth });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function timeToSeconds(t: string): number {
  if (!t || t === "0:00") return 0;
  const parts = t.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function secondsToTime(s: number): string {
  if (s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function getReportDateFromEmail(internalDate: string): string {
  const date = new Date(parseInt(internalDate, 10));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface ParsedRow {
  yardSystemId: string;
  fullName: string;
  numberOfMoves: number;
  avgTimeToCollect: string;
  avgTimeToTravel: string;
  numberOfFullLocations: number;
}

/**
 * FIXED: Parser now handles ALL sections (Day/Afternoon/Night shifts)
 * Previously only parsed the first section, causing data loss
 */
function parseShunterCSV(content: string): ParsedRow[] {
  const lines = content.split(/\r?\n/);
  
  // Find ALL header indices (CSV has multiple sections with repeated headers)
  const headerIndices: number[] = [];
  let headers: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("shunter user id") || lower.includes("full name")) {
      // Store first header for column mapping
      if (headers.length === 0) {
        headers = lines[i].split(",").map((h) => h.trim().toLowerCase());
      }
      headerIndices.push(i);
    }
  }
  
  if (headerIndices.length === 0) {
    console.log("⚠️ No headers found in CSV");
    return [];
  }
  
  console.log(`📄 Found ${headerIndices.length} header sections in CSV`);

  const colIdx = (name: string) => headers.findIndex((h) => h.includes(name));
  const idCol = colIdx("shunter user id");
  const nameCol = colIdx("full name");
  const movesCol = colIdx("no of moves");
  const collectCol = colIdx("avg time to collect");
  const travelCol = colIdx("avg time to travel");
  const fullLocCol = colIdx("no of full locations");

  // Create set of header line numbers for fast lookup
  const headerSet = new Set(headerIndices);
  
  const rows: ParsedRow[] = [];
  
  // Parse ALL lines, skipping only headers
  for (let i = 0; i < lines.length; i++) {
    // Skip header rows
    if (headerSet.has(i)) continue;
    
    const cells = lines[i].split(",").map((c) => c.trim());
    
    // Skip empty lines or lines without ID
    if (!cells[idCol]) continue;
    
    const yardId = cells[idCol]?.toUpperCase() || "";
    const moves = parseInt(cells[movesCol], 10) || 0;
    
    // Skip if no moves or invalid data
    if (!yardId || moves === 0) continue;
    
    rows.push({
      yardSystemId: yardId,
      fullName: cells[nameCol] || "",
      numberOfMoves: moves,
      avgTimeToCollect: cells[collectCol] || "0:00",
      avgTimeToTravel: cells[travelCol] || "0:00",
      numberOfFullLocations: parseInt(cells[fullLocCol], 10) || 0,
    });
  }
  
  console.log(`✅ Parsed ${rows.length} shift entries from ${headerIndices.length} sections`);
  return rows;
}

/**
 * Removes truly identical entries (YMS export bug)
 * NOTE: Entries with different times are NOT duplicates - they're different shifts!
 */
function dedupeIdenticalEntries(rows: ParsedRow[]): ParsedRow[] {
  const dominated = new Set<number>();
  for (let i = 0; i < rows.length; i++) {
    if (dominated.has(i)) continue;
    for (let j = i + 1; j < rows.length; j++) {
      if (dominated.has(j)) continue;
      const a = rows[i], b = rows[j];
      if (
        a.yardSystemId === b.yardSystemId &&
        a.numberOfMoves === b.numberOfMoves &&
        a.avgTimeToCollect === b.avgTimeToCollect &&
        a.avgTimeToTravel === b.avgTimeToTravel &&
        a.numberOfFullLocations === b.numberOfFullLocations
      ) {
        dominated.add(a.fullName.length >= b.fullName.length ? j : i);
      }
    }
  }
  const deduped = rows.filter((_, i) => !dominated.has(i));
  if (deduped.length < rows.length) {
    console.log(`🔍 Removed ${rows.length - deduped.length} duplicate entries`);
  }
  return deduped;
}

interface AggregatedRow extends ParsedRow {
  totalCollectSeconds: number;
  totalTravelSeconds: number;
  shiftCount: number;
}

/**
 * Aggregates multiple shifts for the same shunter into one record
 * Sums moves, calculates weighted average for times
 */
function aggregateShiftData(rows: ParsedRow[]): AggregatedRow[] {
  console.log(`🔄 Aggregating ${rows.length} shift entries...`);
  
  const map = new Map<string, AggregatedRow>();
  for (const r of rows) {
    const key = r.yardSystemId;
    const collectSec = timeToSeconds(r.avgTimeToCollect) * r.numberOfMoves;
    const travelSec = timeToSeconds(r.avgTimeToTravel) * r.numberOfMoves;
    
    if (!map.has(key)) {
      map.set(key, {
        ...r,
        totalCollectSeconds: collectSec,
        totalTravelSeconds: travelSec,
        shiftCount: 1,
      });
      console.log(`  📝 New shunter: ${key}`);
    } else {
      const ex = map.get(key)!;
      const beforeMoves = ex.numberOfMoves;
      
      ex.numberOfMoves += r.numberOfMoves;
      ex.numberOfFullLocations += r.numberOfFullLocations;
      ex.totalCollectSeconds += collectSec;
      ex.totalTravelSeconds += travelSec;
      ex.shiftCount += 1;
      
      if (r.fullName.length > ex.fullName.length) ex.fullName = r.fullName;
      
      console.log(`  ➕ ${key} shift ${ex.shiftCount}: ${r.numberOfMoves} moves → total: ${beforeMoves} + ${r.numberOfMoves} = ${ex.numberOfMoves}`);
    }
  }
  
  // Calculate weighted averages
  for (const v of map.values()) {
    v.avgTimeToCollect = v.numberOfMoves ? secondsToTime(v.totalCollectSeconds / v.numberOfMoves) : "0:00";
    v.avgTimeToTravel = v.numberOfMoves ? secondsToTime(v.totalTravelSeconds / v.numberOfMoves) : "0:00";
    
    if (v.shiftCount > 1) {
      console.log(`  ✅ ${v.yardSystemId}: Aggregated ${v.shiftCount} shifts → ${v.numberOfMoves} total moves`);
    }
  }
  
  console.log(`✅ Aggregation complete: ${rows.length} entries → ${map.size} unique shunters`);
  return [...map.values()];
}

serve(async () => {
  try {
    console.log("🚀 Starting performance import from Gmail...");
    
    const listRes = await gmail.users.messages.list({
      userId: "me",
      labelIds: [GMAIL_FILTER_LABEL_ID],
      maxResults: 10,
    });

    const messages = listRes.data.messages || [];
    if (messages.length === 0) {
      console.log("✅ No new reports to process");
      return new Response(JSON.stringify({ message: "No new reports to process" }), { status: 200 });
    }

    console.log(`📧 Found ${messages.length} messages to process`);
    
    const results: { messageId: string; status: string; date?: string; imported?: number }[] = [];
    
    // Track dates already imported in this run to handle duplicate emails
    const importedDatesThisRun = new Set<string>();

    for (const msg of messages) {
      const msgId = msg.id!;
      console.log(`\n📨 Processing message ${msgId}...`);
      
      const fullMsg = await gmail.users.messages.get({ userId: "me", id: msgId });
      
      // Skip if already has Processed label
      if (fullMsg.data.labelIds?.includes(GMAIL_PROCESSED_LABEL_ID)) {
        console.log(`⏭️ Already processed, skipping`);
        results.push({ messageId: msgId, status: "already_processed" });
        continue;
      }

      const reportDate = getReportDateFromEmail(fullMsg.data.internalDate!);
      console.log(`📅 Report date: ${reportDate}`);

      // CHECK 1: Did we already import this date in this run? (handles duplicate emails)
      if (importedDatesThisRun.has(reportDate)) {
        console.log(`⚠️ Date ${reportDate} already imported in this run, marking as processed`);
        await gmail.users.messages.modify({
          userId: "me",
          id: msgId,
          requestBody: { addLabelIds: [GMAIL_PROCESSED_LABEL_ID] },
        });
        results.push({ messageId: msgId, status: "duplicate_skipped", date: reportDate });
        continue;
      }

      // CHECK 2: Is there already data for this date in the database?
      const { count } = await supabase
        .from("shunter_performance")
        .select("*", { count: "exact", head: true })
        .eq("report_date", reportDate);

      if (count && count > 0) {
        console.log(`⚠️ Data for ${reportDate} already exists in database (${count} records), marking as processed`);
        await gmail.users.messages.modify({
          userId: "me",
          id: msgId,
          requestBody: { addLabelIds: [GMAIL_PROCESSED_LABEL_ID] },
        });
        results.push({ messageId: msgId, status: "date_already_in_db", date: reportDate });
        continue;
      }

      // Find CSV attachment
      const parts = fullMsg.data.payload?.parts || [];
      let csvContent = "";
      for (const part of parts) {
        if (part.filename?.endsWith(".csv") && part.body?.attachmentId) {
          const att = await gmail.users.messages.attachments.get({
            userId: "me",
            messageId: msgId,
            id: part.body.attachmentId,
          });
          csvContent = atob(att.data.data!.replace(/-/g, "+").replace(/_/g, "/"));
          console.log(`📎 Found CSV attachment: ${part.filename}`);
          break;
        }
      }

      if (!csvContent) {
        console.log(`❌ No CSV attachment found`);
        results.push({ messageId: msgId, status: "no_csv_attachment" });
        continue;
      }

      // Parse CSV (NOW PARSES ALL SECTIONS!)
      let rows = parseShunterCSV(csvContent);
      
      rows = dedupeIdenticalEntries(rows);
      
      const aggregated = aggregateShiftData(rows);

      // Get profiles with yard_system_id
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, yard_system_id")
        .not("yard_system_id", "is", null);

      const profileMap = new Map<string, string>();
      for (const p of profiles || []) {
        if (p.yard_system_id) profileMap.set(p.yard_system_id.toUpperCase(), p.id);
      }
      console.log(`👥 Found ${profileMap.size} profiles with yard_system_id`);

      // Import data
      let importedCount = 0;
      let skippedCount = 0;
      
      for (const row of aggregated) {
        const userId = profileMap.get(row.yardSystemId);
        if (!userId) {
          console.log(`⚠️ No profile found for yard_system_id: ${row.yardSystemId}`);
          skippedCount++;
          continue;
        }

        const { error } = await supabase.from("shunter_performance").upsert(
          {
            user_id: userId,
            report_date: reportDate,
            number_of_moves: row.numberOfMoves,
            avg_time_to_collect: row.avgTimeToCollect,
            avg_time_to_travel: row.avgTimeToTravel,
            number_of_full_locations: row.numberOfFullLocations,
            full_name_from_report: row.fullName,
            yard_system_id_from_report: row.yardSystemId,
          },
          { onConflict: "user_id,report_date" }
        );
        
        if (!error) {
          importedCount++;
          const shiftsInfo = row.shiftCount > 1 ? ` (${row.shiftCount} shifts)` : '';
          console.log(`  ✅ ${row.yardSystemId}: ${row.numberOfMoves} moves${shiftsInfo}`);
        } else {
          console.error(`  ❌ Error importing ${row.yardSystemId}:`, error);
        }
      }

      // Mark this date as imported in this run
      importedDatesThisRun.add(reportDate);

      // Mark email as processed
      await gmail.users.messages.modify({
        userId: "me",
        id: msgId,
        requestBody: { addLabelIds: [GMAIL_PROCESSED_LABEL_ID] },
      });

      console.log(`✅ Successfully imported ${importedCount} records for date ${reportDate} (${skippedCount} skipped - no profile)`);
      results.push({ messageId: msgId, status: "imported", date: reportDate, imported: importedCount });
    }

    console.log("\n🎉 Import complete!");
    return new Response(JSON.stringify({ success: true, results }), { status: 200 });
  } catch (err) {
    console.error("❌ Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
