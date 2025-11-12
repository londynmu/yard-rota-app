import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-xl font-semibold text-charcoal">Templates</h3>
          <button 
            onClick={onClose}
            className="text-gray-500 transition hover:text-charcoal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="px-5 py-4">
          <div className="mb-5 flex border-b border-gray-200 text-sm font-medium text-gray-500">
            <button
              onClick={() => setTab('apply')}
              className={`border-b-2 px-4 py-2 transition ${
                tab === 'apply'
                  ? 'border-black text-charcoal'
                  : 'border-transparent hover:text-charcoal'
              }`}
            >
              Apply Template
            </button>
            <button
              onClick={() => setTab('save')}
              className={`border-b-2 px-4 py-2 transition ${
                tab === 'save'
                  ? 'border-black text-charcoal'
                  : 'border-transparent hover:text-charcoal'
              }`}
            >
              Save Current Layout
            </button>
          </div>
          
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          
          {tab === 'apply' && (
            <div>
              <p className="mb-4 text-sm text-gray-600">
                Select a template to apply to {format(new Date(currentDate), 'dd/MM/yyyy')}.
              </p>
              
              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-black"></div>
                </div>
              ) : templates.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-600">
                  <p>No templates found.</p>
                  <button
                    onClick={() => setTab('save')}
                    className="mt-3 text-sm font-semibold text-black underline-offset-4 hover:underline"
                  >
                    Create your first template
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="space-y-5">
                  <div className="max-h-60 space-y-3 overflow-y-auto pr-1">
                    {templates.map(template => (
                      <div 
                        key={template.id}
                        className={`cursor-pointer rounded-lg border p-3 transition ${
                          selectedTemplateId === template.id
                            ? 'border-black bg-black text-white'
                            : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                        }`}
                        onClick={() => setSelectedTemplateId(template.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`font-semibold ${selectedTemplateId === template.id ? 'text-white' : 'text-charcoal'}`}>
                              {template.name}
                            </div>
                            <div className={`text-xs ${selectedTemplateId === template.id ? 'text-gray-200' : 'text-gray-500'}`}>
                              Created: {new Date(template.created_at).toLocaleDateString()}
                            </div>
                            <div className={`mt-1 text-xs ${selectedTemplateId === template.id ? 'text-gray-200' : 'text-gray-500'}`}>
                              {template.slots ? template.slots.length : 0} slots
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTemplate(template.id, template.name);
                            }}
                            className={`transition ${selectedTemplateId === template.id ? 'text-gray-200 hover:text-red-200' : 'text-gray-400 hover:text-red-500'}`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md border border-gray-300 px-4 py-2 text-charcoal hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-md bg-black px-4 py-2 text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
                      disabled={!selectedTemplateId}
                    >
                      Apply Template
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
          
          {tab === 'save' && (
            <div>
              <p className="mb-4 text-sm text-gray-600">
                Save the current layout as a reusable template.
              </p>
              
              <form onSubmit={handleSaveSubmit} className="space-y-5">
                <div>
                  <label className="mb-1 block text-sm font-medium text-charcoal">Template Name</label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="e.g., Standard NRC Day Shift"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-charcoal focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
                    required
                  />
                </div>
                
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md border border-gray-300 px-4 py-2 text-charcoal hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-black px-4 py-2 text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
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

// Add prop types validation
TemplateModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSaveTemplate: PropTypes.func.isRequired,
  onApplyTemplate: PropTypes.func.isRequired,
  currentDate: PropTypes.string.isRequired
}; 