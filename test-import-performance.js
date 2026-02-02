/**
 * Test script for Performance CSV Import Edge Function
 * 
 * This script tests the edge function locally using a real CSV file.
 * It verifies that Chris Jenkins gets 76 moves (38+38 from 2 shifts).
 * 
 * Usage:
 * 1. Start local Supabase: supabase start
 * 2. Serve edge function: supabase functions serve import-performance-csv
 * 3. Run this script: node test-import-performance.js
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-local-anon-key';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/import-performance-csv`;

// Test data
const CSV_FILE_PATH = './raportyyms/Shunters (1).csv';
const TEST_REPORT_DATE = '2026-01-30';

async function testImport() {
  console.log('🧪 Testing Performance CSV Import Edge Function\n');
  
  try {
    // Step 1: Read CSV file
    console.log('📄 Reading CSV file...');
    const csvContent = readFileSync(CSV_FILE_PATH, 'utf-8');
    console.log(`✅ Read ${csvContent.length} characters from CSV\n`);
    
    // Step 2: Call edge function
    console.log('📡 Calling edge function...');
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        csvContent: csvContent,
        reportDate: TEST_REPORT_DATE
      })
    });
    
    if (!response.ok) {
      throw new Error(`Edge function returned ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    console.log('✅ Edge function response:');
    console.log(JSON.stringify(result, null, 2));
    console.log();
    
    // Step 3: Verify in database
    console.log('🔍 Verifying data in database...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data: chrisData, error } = await supabase
      .from('shunter_performance')
      .select(`
        *,
        profiles:user_id (
          yard_system_id,
          first_name,
          last_name
        )
      `)
      .eq('report_date', TEST_REPORT_DATE)
      .eq('profiles.yard_system_id', 'CJ200')
      .single();
    
    if (error) {
      console.error('❌ Error querying database:', error);
      throw error;
    }
    
    if (!chrisData) {
      console.error('❌ No data found for Chris Jenkins (CJ200)');
      throw new Error('Chris Jenkins data not found in database');
    }
    
    console.log('✅ Chris Jenkins data:');
    console.log(`   Yard ID: ${chrisData.profiles.yard_system_id}`);
    console.log(`   Name: ${chrisData.profiles.first_name} ${chrisData.profiles.last_name}`);
    console.log(`   Date: ${chrisData.report_date}`);
    console.log(`   Moves: ${chrisData.number_of_moves}`);
    console.log(`   Avg Collect: ${chrisData.avg_time_to_collect}`);
    console.log(`   Avg Travel: ${chrisData.avg_time_to_travel}`);
    console.log();
    
    // Step 4: Validate results
    console.log('🎯 Validation:');
    
    const expectedMoves = 76; // 38 + 38 from 2 shifts
    const actualMoves = chrisData.number_of_moves;
    
    if (actualMoves === expectedMoves) {
      console.log(`✅ PASS: Chris Jenkins has ${actualMoves} moves (expected ${expectedMoves})`);
      console.log('✅ Aggregation working correctly! 🎉\n');
    } else {
      console.error(`❌ FAIL: Chris Jenkins has ${actualMoves} moves (expected ${expectedMoves})`);
      console.error('❌ Aggregation not working - check edge function logs\n');
      process.exit(1);
    }
    
    // Additional validation: check avg times
    console.log('📊 Additional checks:');
    console.log(`   Collect time: ${chrisData.avg_time_to_collect} (should be around 2:25)`);
    console.log(`   Travel time: ${chrisData.avg_time_to_travel} (should be around 2:39)`);
    console.log();
    
    console.log('🎊 All tests passed! Edge function is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure local Supabase is running: supabase start');
    console.error('2. Make sure edge function is served: supabase functions serve import-performance-csv');
    console.error('3. Check that CSV file exists: ./raportyyms/Shunters (1).csv');
    console.error('4. Verify SUPABASE_URL and SUPABASE_ANON_KEY are correct');
    process.exit(1);
  }
}

// Run test
testImport();
