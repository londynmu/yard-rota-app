import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { format } from 'date-fns';

const TemplateModal = ({ onClose, onSaveTemplate, onApplyTemplate, currentDate }) => {
  const [tab, setTab] = useState('apply'); // 'apply' or 'save'
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  // Fetch templates when component mounts
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('rota_templates')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setTemplates(data || []);
      } catch (err) {
        console.error('Error fetching templates:', err);
        setError('Failed to load templates');
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, []);

  const handleSaveSubmit = async (e) => {
    e.preventDefault();
    
    if (!newTemplateName.trim()) {
      setError('Please enter a template name');
      return;
    }
    
    const success = await onSaveTemplate(newTemplateName.trim());
    if (success) {
      // Refresh templates list
      const { data } = await supabase
        .from('rota_templates')
        .select('*')
        .order('created_at', { ascending: false });
      
      setTemplates(data || []);
      setNewTemplateName('');
      setTab('apply'); // Switch to apply tab after saving
    }
  };

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedTemplateId) {
      setError('Please select a template');
      return;
    }
    
    const success = await onApplyTemplate(selectedTemplateId);
    if (success) {
      onClose();
    }
  };

  const handleDeleteTemplate = async (templateId, templateName) => {
    const confirm = window.confirm(`Are you sure you want to delete template "${templateName}"? This action cannot be undone.`);
    
    if (!confirm) return;
    
    try {
      const { error } = await supabase
        .from('rota_templates')
        .delete()
        .eq('id', templateId);
      
      if (error) throw error;
      
      // Update UI
      setTemplates(templates.filter(template => template.id !== templateId));
      
      // Reset selection if the deleted template was selected
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(null);
      }
    } catch (err) {
      console.error('Error deleting template:', err);
      setError('Failed to delete template');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-lg shadow-xl overflow-hidden w-full max-w-xl mx-auto">
        <div className="p-5">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-xl font-medium text-white">Templates</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex border-b border-gray-700 mb-5">
            <button
              onClick={() => setTab('apply')}
              className={`px-4 py-2 font-medium ${
                tab === 'apply'
                  ? 'border-b-2 border-blue-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Apply Template
            </button>
            <button
              onClick={() => setTab('save')}
              className={`px-4 py-2 font-medium ${
                tab === 'save'
                  ? 'border-b-2 border-blue-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Save Current Layout
            </button>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-white rounded-md">
              {error}
            </div>
          )}
          
          {/* Apply Template Tab */}
          {tab === 'apply' && (
            <div>
              <p className="text-gray-300 mb-4">
                Select a template to apply to the current date ({format(new Date(currentDate), 'dd/MM/yyyy')}).
              </p>
              
              {loading ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>No templates found</p>
                  <button
                    onClick={() => setTab('save')}
                    className="mt-2 text-blue-500 hover:text-blue-400"
                  >
                    Create your first template
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="space-y-5">
                  <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                    {templates.map(template => (
                      <div 
                        key={template.id}
                        className={`relative p-3 rounded-md border cursor-pointer ${
                          selectedTemplateId === template.id
                            ? 'bg-blue-900/30 border-blue-800'
                            : 'bg-gray-800/30 border-gray-700 hover:bg-gray-800/60'
                        }`}
                        onClick={() => setSelectedTemplateId(template.id)}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-medium text-white">{template.name}</div>
                            <div className="text-xs text-gray-400">
                              Created: {new Date(template.created_at).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {template.slots ? template.slots.length : 0} slots
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTemplate(template.id, template.name);
                            }}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!selectedTemplateId}
                    >
                      Apply Template
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
          
          {/* Save Template Tab */}
          {tab === 'save' && (
            <div>
              <p className="text-gray-300 mb-4">
                Save the current layout as a template for future use.
              </p>
              
              <form onSubmit={handleSaveSubmit} className="space-y-5">
                <div>
                  <label className="block text-white mb-1">Template Name</label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="e.g., Standard NRC Day Shift"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!newTemplateName.trim()}
                  >
                    Save Template
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateModal; 