/**
 * CSV Import Helper for Shunter Performance Data
 * Handles parsing, validation, and import of daily shunter reports
 */

/**
 * Converts time string "M:SS" or "MM:SS" to total seconds
 * @param {string} timeStr - Time in format like "2:26" or "3:21"
 * @returns {number} Total seconds
 */
export function timeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  
  const parts = timeStr.trim().split(':');
  if (parts.length !== 2) return 0;
  
  const minutes = parseInt(parts[0], 10) || 0;
  const seconds = parseInt(parts[1], 10) || 0;
  
  return minutes * 60 + seconds;
}

/**
 * Converts seconds back to "M:SS" format
 * @param {number} totalSeconds
 * @returns {string} Time in "M:SS" format
 */
export function secondsToTime(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0:00';
  
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Parses CSV content and extracts shunter performance data
 * @param {string} fileContent - Raw CSV file content
 * @returns {Array<Object>} Parsed shunter data
 */
export function parseShunterCSV(fileContent) {
  if (!fileContent || typeof fileContent !== 'string') {
    throw new Error('Invalid CSV content');
  }

  const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Find the header row (contains "Shunter user id")
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Shunter user id')) {
      headerIndex = i;
      break;
    }
  }
  
  if (headerIndex === -1) {
    throw new Error('Could not find header row with "Shunter user id"');
  }
  
  // Parse header to get column indices
  const headerLine = lines[headerIndex];
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
  
  // Parse data rows
  const parsedData = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines or header repetitions
    if (!line || line.includes('Shunter user id')) continue;
    
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
  
  return parsedData;
}

/**
 * Validates parsed CSV data
 * @param {Array<Object>} parsedData
 * @returns {Object} Validation result with { isValid, errors }
 */
export function validateCSVData(parsedData) {
  const errors = [];
  
  if (!Array.isArray(parsedData) || parsedData.length === 0) {
    errors.push('No valid data found in CSV file');
    return { isValid: false, errors };
  }
  
  // Check for duplicate yard IDs that shouldn't be summed (data quality issue)
  const yardIds = parsedData.map(d => d.yardSystemId);
  const duplicateCounts = {};
  yardIds.forEach(id => {
    duplicateCounts[id] = (duplicateCounts[id] || 0) + 1;
  });
  
  const duplicates = Object.entries(duplicateCounts)
    .filter(([_, count]) => count > 3)
    .map(([id, count]) => `${id} (${count} times)`);
  
  if (duplicates.length > 0) {
    errors.push(`Unusual duplicate count (more than 3 shifts): ${duplicates.join(', ')}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings: duplicates.length > 0 ? errors : []
  };
}

/**
 * Aggregates multiple shift entries for the same shunter (same day, multiple shifts)
 * Sums moves, calculates weighted average for times
 * @param {Array<Object>} parsedData
 * @returns {Array<Object>} Aggregated data with one entry per shunter
 */
export function aggregateShiftData(parsedData) {
  const aggregated = {};
  
  parsedData.forEach(entry => {
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
    }
    
    const current = aggregated[id];
    
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
  });
  
  // Calculate weighted averages
  return Object.values(aggregated).map(data => {
    const avgCollectSeconds = data.numberOfMoves > 0 
      ? Math.round(data.totalCollectSeconds / data.numberOfMoves)
      : 0;
    const avgTravelSeconds = data.numberOfMoves > 0
      ? Math.round(data.totalTravelSeconds / data.numberOfMoves)
      : 0;
    
    return {
      yardSystemId: data.yardSystemId,
      fullName: data.fullName,
      numberOfMoves: data.numberOfMoves,
      avgTimeToCollect: secondsToTime(avgCollectSeconds),
      avgTimeToTravel: secondsToTime(avgTravelSeconds),
      numberOfFullLocations: data.numberOfFullLocations,
      shiftCount: data.shiftCount
    };
  });
}

/**
 * Matches parsed CSV data with user profiles from database
 * @param {Array<Object>} aggregatedData - Aggregated shunter data
 * @param {Array<Object>} profiles - User profiles from database
 * @returns {Object} { matched, unmatched }
 */
export function matchUsersWithCSV(aggregatedData, profiles) {
  const matched = [];
  const unmatched = [];
  
  aggregatedData.forEach(csvEntry => {
    const profile = profiles.find(p => 
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
  
  return { matched, unmatched };
}

/**
 * Imports performance data to database
 * @param {Object} supabase - Supabase client
 * @param {string} reportDate - Date in YYYY-MM-DD format
 * @param {Array<Object>} matchedData - Matched shunter data with user IDs
 * @returns {Promise<Object>} Import result
 */
export async function importPerformanceData(supabase, reportDate, matchedData) {
  if (!matchedData || matchedData.length === 0) {
    return { success: false, error: 'No data to import', imported: 0 };
  }
  
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
    const { data, error } = await supabase
      .from('shunter_performance')
      .upsert(records, {
        onConflict: 'user_id,report_date',
        ignoreDuplicates: false
      });
    
    if (error) {
      console.error('Import error:', error);
      return { success: false, error: error.message, imported: 0 };
    }
    
    return { success: true, imported: records.length, data };
  } catch (err) {
    console.error('Import exception:', err);
    return { success: false, error: err.message, imported: 0 };
  }
}

