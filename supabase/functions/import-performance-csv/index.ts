/**
 * Supabase Edge Function: Import Performance CSV
 * 
 * This function automatically imports daily shunter performance reports from email attachments.
 * It uses the same logic as the manual import in Admin Panel to ensure consistency.
 * 
 * Triggered by: Supabase cron job daily at 06:30
 * 
 * Environment Variables Required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - EMAIL_IMAP_HOST (e.g., imap.gmail.com)
 * - EMAIL_IMAP_PORT (e.g., 993)
 * - EMAIL_USERNAME
 * - EMAIL_PASSWORD (or App Password for Gmail)
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

// CSV Import Helper Functions (ported from src/utils/csvImportHelper.js)

/**
 * Converts time string "M:SS" or "MM:SS" to total seconds
 */
function timeToSeconds(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  
  const parts = timeStr.trim().split(':');
  if (parts.length !== 2) return 0;
  
  const minutes = parseInt(parts[0], 10) || 0;
  const seconds = parseInt(parts[1], 10) || 0;
  
  return minutes * 60 + seconds;
}

/**
 * Converts seconds back to "M:SS" format
 */
function secondsToTime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0:00';
  
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Parses CSV content and extracts shunter performance data
 * FIXED: Now parses ALL sections (Day/Afternoon/Night shifts), not just the first one
 */
function parseShunterCSV(fileContent: string): any[] {
  if (!fileContent || typeof fileContent !== 'string') {
    throw new Error('Invalid CSV content');
  }

  const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Find ALL header rows (CSV has multiple sections with repeated headers)
  const headerIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Shunter user id')) {
      headerIndices.push(i);
    }
  }
  
  if (headerIndices.length === 0) {
    throw new Error('Could not find header row with "Shunter user id"');
  }
  
  console.log(`📄 [parseShunterCSV] Found ${headerIndices.length} header sections in CSV`);
  
  // Parse header to get column indices (use first header)
  const headerLine = lines[headerIndices[0]];
  const headers = headerLine.split(',').map(h => h.trim());
  
  const columnMap = {
    userId: headers.findIndex(h => h.toLowerCase().includes('shunter user id')),
    fullName: headers.findIndex(h => h.toLowerCase().includes('full name')),
    moves: headers.findIndex(h => h.toLowerCase().includes('no of moves')),
    avgCollect: headers.findIndex(h => h.toLowerCase().includes('average time to coll')),
    avgTravel: headers.findIndex(h => h.toLowerCase().includes('average time to trav')),
    fullLocations: headers.findIndex(h => h.toLowerCase().includes('no of full location'))
  };
  
  // Validate all required columns exist
  const missingColumns = [];
  if (columnMap.userId === -1) missingColumns.push('Shunter user id');
  if (columnMap.fullName === -1) missingColumns.push('Full name');
  if (columnMap.moves === -1) missingColumns.push('No of moves');
  if (columnMap.avgCollect === -1) missingColumns.push('Average time to collect');
  if (columnMap.avgTravel === -1) missingColumns.push('Average time to travel');
  
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
  }
  
  // Parse data rows from ALL sections
  const parsedData = [];
  const headerSet = new Set(headerIndices); // For fast lookup
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip header rows
    if (headerSet.has(i)) continue;
    
    // Skip empty lines
    if (!line) continue;
    
    const columns = line.split(',').map(c => c.trim());
    
    const userId = columns[columnMap.userId];
    const fullName = columns[columnMap.fullName];
    const moves = parseInt(columns[columnMap.moves], 10);
    const avgCollect = columns[columnMap.avgCollect];
    const avgTravel = columns[columnMap.avgTravel];
    const fullLocations = columnMap.fullLocations !== -1 ? parseInt(columns[columnMap.fullLocations], 10) : 0;
    
    // Skip rows without valid user ID or moves
    if (!userId || isNaN(moves) || moves === 0) continue;
    
    parsedData.push({
      yardSystemId: userId.toUpperCase().trim(),
      fullName: fullName || '',
      numberOfMoves: moves,
      avgTimeToCollect: avgCollect || '0:00',
      avgTimeToTravel: avgTravel || '0:00',
      numberOfFullLocations: isNaN(fullLocations) ? 0 : fullLocations
    });
  }
  
  console.log(`📄 [parseShunterCSV] Parsed ${parsedData.length} shift entries from ${headerIndices.length} sections`);
  return parsedData;
}

/**
 * Deduplicates identical entries that share the same yard ID and metrics
 */
function dedupeIdenticalEntries(parsedData: any[]): any[] {
  if (!Array.isArray(parsedData)) return [];

  const uniqueMap = new Map();

  parsedData.forEach((entry) => {
    const key = [
      entry.yardSystemId || '',
      entry.numberOfMoves ?? '',
      entry.avgTimeToCollect || '',
      entry.avgTimeToTravel || '',
      entry.numberOfFullLocations ?? ''
    ].join('|');

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, entry);
    } else {
      // Prefer entry with a longer / non-empty name if duplicates exist
      const current = uniqueMap.get(key);
      const currentNameLength = current.fullName?.length || 0;
      const newNameLength = entry.fullName?.length || 0;
      if (newNameLength > currentNameLength) {
        uniqueMap.set(key, entry);
      }
    }
  });

  const deduped = Array.from(uniqueMap.values());
  const duplicateCount = parsedData.length - deduped.length;
  if (duplicateCount > 0) {
    console.log(`🔍 [dedupeIdenticalEntries] Removed ${duplicateCount} duplicate entries`);
  }
  
  return deduped;
}

/**
 * Aggregates multiple shift entries for the same shunter (same day, multiple shifts)
 * Sums moves, calculates weighted average for times
 */
function aggregateShiftData(parsedData: any[]): any[] {
  console.log(`🔄 [aggregateShiftData] Processing ${parsedData.length} shift entries`);
  
  const aggregated: any = {};
  
  parsedData.forEach((entry, idx) => {
    const id = entry.yardSystemId;
    
    if (!aggregated[id]) {
      aggregated[id] = {
        yardSystemId: id,
        fullName: entry.fullName,
        numberOfMoves: 0,
        totalCollectSeconds: 0,
        totalTravelSeconds: 0,
        numberOfFullLocations: 0,
        shiftCount: 0
      };
      console.log(`  📝 New shunter: ${id}`);
    }
    
    const current = aggregated[id];
    const beforeMoves = current.numberOfMoves;
    
    // Sum moves
    current.numberOfMoves += entry.numberOfMoves;
    
    // Weighted average for times (weight by number of moves in this shift)
    const collectSeconds = timeToSeconds(entry.avgTimeToCollect);
    const travelSeconds = timeToSeconds(entry.avgTimeToTravel);
    
    current.totalCollectSeconds += collectSeconds * entry.numberOfMoves;
    current.totalTravelSeconds += travelSeconds * entry.numberOfMoves;
    
    // Sum full locations
    current.numberOfFullLocations += entry.numberOfFullLocations;
    
    current.shiftCount += 1;
    
    console.log(`  ➕ ${id} shift ${current.shiftCount}: ${entry.numberOfMoves} moves (collect: ${entry.avgTimeToCollect}, travel: ${entry.avgTimeToTravel}) → total: ${beforeMoves} + ${entry.numberOfMoves} = ${current.numberOfMoves}`);
  });
  
  // Calculate weighted averages
  const result = Object.values(aggregated).map((data: any) => {
    const avgCollectSeconds = data.numberOfMoves > 0 
      ? Math.round(data.totalCollectSeconds / data.numberOfMoves)
      : 0;
    const avgTravelSeconds = data.numberOfMoves > 0
      ? Math.round(data.totalTravelSeconds / data.numberOfMoves)
      : 0;
    
    const aggregatedEntry = {
      yardSystemId: data.yardSystemId,
      fullName: data.fullName,
      numberOfMoves: data.numberOfMoves,
      avgTimeToCollect: secondsToTime(avgCollectSeconds),
      avgTimeToTravel: secondsToTime(avgTravelSeconds),
      numberOfFullLocations: data.numberOfFullLocations,
      shiftCount: data.shiftCount
    };
    
    if (data.shiftCount > 1) {
      console.log(`  ✅ ${data.yardSystemId}: Aggregated ${data.shiftCount} shifts → ${data.numberOfMoves} total moves (avg collect: ${aggregatedEntry.avgTimeToCollect}, avg travel: ${aggregatedEntry.avgTimeToTravel})`);
    }
    
    return aggregatedEntry;
  });
  
  console.log(`✅ [aggregateShiftData] Completed: ${parsedData.length} entries → ${result.length} unique shunters`);
  return result;
}

/**
 * Matches parsed CSV data with user profiles from database
 */
async function matchUsersWithCSV(aggregatedData: any[], supabase: any): Promise<{ matched: any[], unmatched: any[] }> {
  console.log(`🔍 [matchUsersWithCSV] Fetching user profiles...`);
  
  // Fetch all profiles with yard_system_id
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, yard_system_id, avatar_url')
    .not('yard_system_id', 'is', null);
  
  if (error) {
    console.error('❌ [matchUsersWithCSV] Error fetching profiles:', error);
    throw new Error(`Failed to fetch user profiles: ${error.message}`);
  }
  
  console.log(`✅ [matchUsersWithCSV] Found ${profiles?.length || 0} profiles with Yard System ID`);
  
  const matched: any[] = [];
  const unmatched: any[] = [];
  
  aggregatedData.forEach(csvEntry => {
    const profile = profiles?.find((p: any) => 
      p.yard_system_id && 
      p.yard_system_id.toUpperCase() === csvEntry.yardSystemId.toUpperCase()
    );
    
    if (profile) {
      matched.push({
        ...csvEntry,
        userId: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        avatarUrl: profile.avatar_url
      });
    } else {
      unmatched.push(csvEntry);
    }
  });
  
  console.log(`✅ [matchUsersWithCSV] Matched: ${matched.length}, Unmatched: ${unmatched.length}`);
  
  if (unmatched.length > 0) {
    console.warn('⚠️ [matchUsersWithCSV] Unmatched shunters (missing Yard System ID in profile):');
    unmatched.forEach(u => {
      console.warn(`  - ${u.yardSystemId}: ${u.fullName} (${u.numberOfMoves} moves)`);
    });
  }
  
  return { matched, unmatched };
}

/**
 * Imports performance data to database
 */
async function importPerformanceData(supabase: any, reportDate: string, matchedData: any[]): Promise<any> {
  if (!matchedData || matchedData.length === 0) {
    console.warn('⚠️ [importPerformanceData] No data to import');
    return { success: false, error: 'No data to import', imported: 0 };
  }
  
  console.log(`📊 [importPerformanceData] Importing ${matchedData.length} performance records for ${reportDate}`);
  
  // Log each record being imported
  matchedData.forEach(data => {
    const shiftsInfo = data.shiftCount > 1 ? ` (${data.shiftCount} shifts aggregated)` : '';
    console.log(`  📝 ${data.yardSystemId} (${data.firstName} ${data.lastName}): ${data.numberOfMoves} moves${shiftsInfo}`);
    console.log(`      Collect: ${data.avgTimeToCollect}, Travel: ${data.avgTimeToTravel}`);
  });
  
  const records = matchedData.map(data => ({
    user_id: data.userId,
    report_date: reportDate,
    number_of_moves: data.numberOfMoves,
    avg_time_to_collect: data.avgTimeToCollect,
    avg_time_to_travel: data.avgTimeToTravel,
    number_of_full_locations: data.numberOfFullLocations,
    full_name_from_report: data.fullName,
    yard_system_id_from_report: data.yardSystemId
  }));
  
  try {
    // Use upsert to handle re-imports of the same date
    console.log(`💾 [importPerformanceData] Upserting ${records.length} records to database...`);
    const { data, error } = await supabase
      .from('shunter_performance')
      .upsert(records, {
        onConflict: 'user_id,report_date'
      });
    
    if (error) {
      console.error('❌ [importPerformanceData] Import error:', error);
      return { success: false, error: error.message, imported: 0 };
    }
    
    console.log(`✅ [importPerformanceData] Successfully imported ${records.length} records`);
    return { success: true, imported: records.length, data };
  } catch (err: any) {
    console.error('❌ [importPerformanceData] Import exception:', err);
    return { success: false, error: err.message, imported: 0 };
  }
}

// Main Edge Function Handler
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🚀 [import-performance-csv] Edge function invoked');
    
    // Initialize Supabase client with service role key (admin access)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request body
    const body = await req.json();
    const { csvContent, reportDate } = body;
    
    if (!csvContent) {
      throw new Error('Missing CSV content in request body');
    }
    
    if (!reportDate) {
      throw new Error('Missing report date in request body');
    }
    
    console.log(`📅 Processing report for date: ${reportDate}`);
    
    // Step 1: Parse CSV
    const parsed = parseShunterCSV(csvContent);
    
    // Step 2: Deduplicate identical entries
    const deduped = dedupeIdenticalEntries(parsed);
    
    // Step 3: Aggregate shift data
    const aggregated = aggregateShiftData(deduped);
    
    // Step 4: Match with user profiles
    const { matched, unmatched } = await matchUsersWithCSV(aggregated, supabase);
    
    // Step 5: Import to database
    const result = await importPerformanceData(supabase, reportDate, matched);
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    console.log('✅ [import-performance-csv] Import completed successfully');
    
    return new Response(
      JSON.stringify({
        success: true,
        imported: result.imported,
        unmatched: unmatched.length,
        unmatchedDetails: unmatched.map(u => ({
          yardSystemId: u.yardSystemId,
          fullName: u.fullName,
          numberOfMoves: u.numberOfMoves
        }))
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
    
  } catch (error: any) {
    console.error('❌ [import-performance-csv] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
