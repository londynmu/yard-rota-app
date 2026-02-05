import React, { useState } from 'react';
import PropTypes from 'prop-types';
import ImageUpload from './ImageUpload';
import TugDiagram from './TugDiagram';

export default function DamageReport({ damages, onDamagesChange }) {
  const [isAdding, setIsAdding] = useState(false);
  const [currentDamage, setCurrentDamage] = useState({
    description: '',
    location_on_tug: null,
    severity: 'minor',
    images: [],
  });

  const handleAdd = () => {
    if (!currentDamage.description.trim()) {
      alert('Please describe the damage.');
      return;
    }

    const newDamage = {
      ...currentDamage,
      id: `damage-${Date.now()}`,
    };

    onDamagesChange([...damages, newDamage]);
    setCurrentDamage({ description: '', location_on_tug: null, severity: 'minor', images: [] });
    setIsAdding(false);
  };

  const handleRemove = (id) => {
    onDamagesChange(damages.filter(d => d.id !== id));
  };

  const severityColors = {
    minor: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    major: 'bg-orange-100 text-orange-800 border-orange-300',
    critical: 'bg-red-100 text-red-800 border-red-300',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-charcoal">Damage Reports</label>
        {damages.length > 0 && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
            {damages.length} damage{damages.length !== 1 ? 's' : ''} found
          </span>
        )}
      </div>

      {/* Existing damages list */}
      {damages.map((damage) => (
        <div key={damage.id} className={`p-3 rounded-lg border ${severityColors[damage.severity]}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase">{damage.severity}</span>
                {damage.location_on_tug && (
                  <span className="text-xs opacity-70">• {damage.location_on_tug}</span>
                )}
              </div>
              <p className="text-sm">{damage.description}</p>
              {damage.images.length > 0 && (
                <p className="text-xs mt-1 opacity-70">{damage.images.length} photo(s) attached</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleRemove(damage.id)}
              className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      ))}

      {/* Add damage form */}
      {isAdding ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-4">
          <h4 className="font-semibold text-charcoal text-sm">Report New Damage</h4>
          
          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
            <textarea
              value={currentDamage.description}
              onChange={(e) => setCurrentDamage(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the damage in detail..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-300 focus:border-red-300"
            />
          </div>

          {/* Severity */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Severity</label>
            <div className="flex gap-2">
              {['minor', 'major', 'critical'].map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setCurrentDamage(prev => ({ ...prev, severity: level }))}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all capitalize ${
                    currentDamage.severity === level
                      ? level === 'minor' ? 'bg-yellow-500 text-white' 
                        : level === 'major' ? 'bg-orange-500 text-white'
                        : 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Location on tug */}
          <TugDiagram 
            selectedZone={currentDamage.location_on_tug} 
            onSelectZone={(zone) => setCurrentDamage(prev => ({ ...prev, location_on_tug: zone }))}
          />

          {/* Photo upload */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Photos</label>
            <ImageUpload 
              images={currentDamage.images} 
              onImagesChange={(imgs) => setCurrentDamage(prev => ({ ...prev, images: imgs }))}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleAdd}
              className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
            >
              Add Damage Report
            </button>
            <button
              type="button"
              onClick={() => { setIsAdding(false); setCurrentDamage({ description: '', location_on_tug: null, severity: 'minor', images: [] }); }}
              className="px-4 py-2.5 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="w-full py-3 border-2 border-dashed border-red-300 text-red-600 font-medium text-sm rounded-xl hover:bg-red-50 hover:border-red-400 transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Report Damage
        </button>
      )}
    </div>
  );
}

DamageReport.propTypes = {
  damages: PropTypes.array.isRequired,
  onDamagesChange: PropTypes.func.isRequired,
};
