import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../ui/ToastContext';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format as formatDate } from 'date-fns';
import {
  parseShunterCSV,
  validateCSVData,
  aggregateShiftData,
  matchUsersWithCSV,
  importPerformanceData
} from '../../utils/csvImportHelper';

const PerformanceImport = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [importHistory, setImportHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // File upload states
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Date selection (default to yesterday)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const [reportDate, setReportDate] = useState(yesterday);
  
  // Preview states
  const [previewData, setPreviewData] = useState(null);
  const [matchedData, setMatchedData] = useState([]);
  const [unmatchedData, setUnmatchedData] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  
  // Fetch all profiles with yard_system_id
  const fetchProfiles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, yard_system_id, avatar_url')
        .not('yard_system_id', 'is', null);
      
      if (error) throw error;
      setProfiles(data || []);
    } catch (err) {
      console.error('Error fetching profiles:', err);
      toast.error('Failed to load user profiles');
    }
  }, [toast]);
  
  // Fetch import history
  const fetchImportHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('shunter_performance')
        .select('report_date, user_id')
        .order('report_date', { ascending: false });
      
      if (error) throw error;
      
      // Group by date and count records
      const grouped = {};
      (data || []).forEach(record => {
        const date = record.report_date;
        if (!grouped[date]) {
          grouped[date] = 0;
        }
        grouped[date]++;
      });
      
      const history = Object.entries(grouped).map(([date, count]) => ({
        date,
        recordCount: count
      }));
      
      setImportHistory(history);
    } catch (err) {
      console.error('Error fetching import history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);
  
  useEffect(() => {
    fetchProfiles();
    fetchImportHistory();
  }, [fetchProfiles, fetchImportHistory]);
  
  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };
  
  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };
  
  // Process uploaded file
  const processFile = async (file) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }
    
    setSelectedFile(file);
    setLoading(true);
    setPreviewData(null);
    setMatchedData([]);
    setUnmatchedData([]);
    setValidationErrors([]);
    
    try {
      const fileContent = await file.text();
      
      // Parse CSV
      const parsed = parseShunterCSV(fileContent);
      
      // Validate
      const validation = validateCSVData(parsed);
      if (!validation.isValid) {
        setValidationErrors(validation.errors);
        toast.error('CSV validation failed');
        setLoading(false);
        return;
      }
      
      if (validation.warnings && validation.warnings.length > 0) {
        validation.warnings.forEach(warning => toast.warning(warning));
      }
      
      // Aggregate shift data (sum moves from multiple shifts)
      const aggregated = aggregateShiftData(parsed);
      
      // Match with user profiles
      const { matched, unmatched } = matchUsersWithCSV(aggregated, profiles);
      
      setPreviewData(aggregated);
      setMatchedData(matched);
      setUnmatchedData(unmatched);
      
      toast.success(`Parsed ${aggregated.length} shunters: ${matched.length} matched, ${unmatched.length} unmapped`);
    } catch (err) {
      console.error('File processing error:', err);
      toast.error(err.message || 'Failed to process CSV file');
      setSelectedFile(null);
    } finally {
      setLoading(false);
    }
  };
  
  // Import data to database
  const handleImport = async () => {
    if (matchedData.length === 0) {
      toast.error('No matched data to import');
      return;
    }
    
    setLoading(true);
    try {
      const dateStr = formatDate(reportDate, 'yyyy-MM-dd');
      const result = await importPerformanceData(supabase, dateStr, matchedData);
      
      if (result.success) {
        toast.success(`Successfully imported ${result.imported} records for ${formatDate(reportDate, 'dd/MM/yyyy')}`);
        
        // Reset form
        setSelectedFile(null);
        setPreviewData(null);
        setMatchedData([]);
        setUnmatchedData([]);
        
        // Refresh history
        fetchImportHistory();
      } else {
        toast.error(`Import failed: ${result.error}`);
      }
    } catch (err) {
      console.error('Import error:', err);
      toast.error('Failed to import data');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-charcoal mb-2">Performance Data Import</h2>
        <p className="text-gray-600">Upload daily shunter performance reports (CSV format)</p>
      </div>
      
      {/* Date Selection */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <label className="block text-sm font-medium text-charcoal mb-2">
          Report Date
        </label>
        <DatePicker
          selected={reportDate}
          onChange={(date) => setReportDate(date)}
          dateFormat="dd/MM/yyyy"
          maxDate={new Date()}
          className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-md text-charcoal bg-white focus:ring-2 focus:ring-black focus:border-transparent"
        />
        <p className="text-xs text-gray-500 mt-1">
          Select the date this report covers (defaults to yesterday)
        </p>
      </div>
      
      {/* File Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-black bg-gray-50'
            : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
          id="csv-upload"
        />
        <label htmlFor="csv-upload" className="cursor-pointer">
          <div className="space-y-2">
            <div className="text-4xl">📊</div>
            <div className="text-charcoal font-medium">
              {selectedFile ? selectedFile.name : 'Drop CSV file here or click to browse'}
            </div>
            <div className="text-sm text-gray-500">
              Accepts .csv files from daily shunter reports
            </div>
          </div>
        </label>
      </div>
      
      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-900 mb-2">Validation Errors:</h3>
          <ul className="list-disc list-inside text-red-700 text-sm space-y-1">
            {validationErrors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Preview Section */}
      {previewData && previewData.length > 0 && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="text-green-900 font-semibold">✅ Matched</div>
              <div className="text-3xl font-bold text-green-700">{matchedData.length}</div>
              <div className="text-sm text-green-600">Ready to import</div>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="text-yellow-900 font-semibold">⚠️ Unmapped</div>
              <div className="text-3xl font-bold text-yellow-700">{unmatchedData.length}</div>
              <div className="text-sm text-yellow-600">Missing Yard System ID</div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-blue-900 font-semibold">📋 Total</div>
              <div className="text-3xl font-bold text-blue-700">{previewData.length}</div>
              <div className="text-sm text-blue-600">Shunters in report</div>
            </div>
          </div>
          
          {/* Matched Data Preview */}
          {matchedData.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-green-50 px-4 py-3 border-b border-green-200">
                <h3 className="font-semibold text-green-900">✅ Matched Shunters ({matchedData.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-charcoal font-medium">Yard ID</th>
                      <th className="px-4 py-2 text-left text-charcoal font-medium">User</th>
                      <th className="px-4 py-2 text-right text-charcoal font-medium">Moves</th>
                      <th className="px-4 py-2 text-right text-charcoal font-medium">Avg Collect</th>
                      <th className="px-4 py-2 text-right text-charcoal font-medium">Avg Travel</th>
                      <th className="px-4 py-2 text-right text-charcoal font-medium">Shifts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {matchedData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-charcoal">{item.yardSystemId}</td>
                        <td className="px-4 py-2 text-charcoal">
                          {item.firstName} {item.lastName}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-charcoal">{item.numberOfMoves}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{item.avgTimeToCollect}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{item.avgTimeToTravel}</td>
                        <td className="px-4 py-2 text-right text-gray-500">{item.shiftCount || 1}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Unmatched Data */}
          {unmatchedData.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-yellow-50 px-4 py-3 border-b border-yellow-200">
                <h3 className="font-semibold text-yellow-900">⚠️ Unmapped Shunters ({unmatchedData.length})</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  These shunters don&apos;t have their Yard System ID set in their profile. Add it in User Management.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-charcoal font-medium">Yard ID</th>
                      <th className="px-4 py-2 text-left text-charcoal font-medium">Name from CSV</th>
                      <th className="px-4 py-2 text-right text-charcoal font-medium">Moves</th>
                      <th className="px-4 py-2 text-right text-charcoal font-medium">Shifts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {unmatchedData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-charcoal font-semibold">{item.yardSystemId}</td>
                        <td className="px-4 py-2 text-gray-600">{item.fullName}</td>
                        <td className="px-4 py-2 text-right text-charcoal">{item.numberOfMoves}</td>
                        <td className="px-4 py-2 text-right text-gray-500">{item.shiftCount || 1}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Import Button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setSelectedFile(null);
                setPreviewData(null);
                setMatchedData([]);
                setUnmatchedData([]);
              }}
              className="px-6 py-2 border border-gray-300 rounded-md text-charcoal hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={loading || matchedData.length === 0}
              className="px-6 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? 'Importing...' : `Import ${matchedData.length} Records`}
            </button>
          </div>
        </div>
      )}
      
      {/* Import History */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-charcoal">Import History</h3>
        </div>
        <div className="p-4">
          {loadingHistory ? (
            <div className="text-center py-8 text-gray-500">Loading history...</div>
          ) : importHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No imports yet</div>
          ) : (
            <div className="space-y-2">
              {importHistory.map((record, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded border border-gray-200"
                >
                  <span className="text-charcoal font-medium">
                    {formatDate(new Date(record.date), 'dd/MM/yyyy')}
                  </span>
                  <span className="text-gray-600">
                    {record.recordCount} {record.recordCount === 1 ? 'record' : 'records'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PerformanceImport;

