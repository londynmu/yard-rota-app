import React from 'react';
import PropTypes from 'prop-types';

const ZONES = [
  { id: 'front', label: 'Front', x: '50%', y: '8%', w: 60, h: 30 },
  { id: 'rear', label: 'Rear', x: '50%', y: '92%', w: 60, h: 30 },
  { id: 'left', label: 'Left', x: '8%', y: '50%', w: 40, h: 50 },
  { id: 'right', label: 'Right', x: '92%', y: '50%', w: 40, h: 50 },
  { id: 'top', label: 'Top/Cab', x: '50%', y: '35%', w: 70, h: 40 },
  { id: 'interior', label: 'Interior', x: '50%', y: '65%', w: 70, h: 30 },
];

export default function TugDiagram({ selectedZone, onSelectZone }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-charcoal mb-2">
        Damage Location on Tug
      </label>
      <div className="relative w-full max-w-sm mx-auto aspect-[3/4] bg-gray-50 rounded-xl border-2 border-gray-200 overflow-hidden">
        {/* Simple tug outline */}
        <svg viewBox="0 0 200 280" className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {/* Tug body */}
          <rect x="40" y="30" width="120" height="220" rx="15" ry="15" 
            fill="none" stroke="#94a3b8" strokeWidth="2" />
          {/* Cab */}
          <rect x="50" y="40" width="100" height="80" rx="8" ry="8" 
            fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 2" />
          {/* Wheels front */}
          <rect x="30" y="50" width="15" height="35" rx="4" fill="#cbd5e1" />
          <rect x="155" y="50" width="15" height="35" rx="4" fill="#cbd5e1" />
          {/* Wheels rear */}
          <rect x="30" y="190" width="15" height="35" rx="4" fill="#cbd5e1" />
          <rect x="155" y="190" width="15" height="35" rx="4" fill="#cbd5e1" />
          {/* Fifth wheel area */}
          <circle cx="100" cy="190" r="20" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
          {/* Front indicator */}
          <text x="100" y="22" textAnchor="middle" className="text-[10px] fill-gray-400 font-medium">FRONT</text>
          {/* Rear indicator */}
          <text x="100" y="268" textAnchor="middle" className="text-[10px] fill-gray-400 font-medium">REAR</text>
        </svg>

        {/* Clickable zones */}
        {ZONES.map(zone => (
          <button
            key={zone.id}
            type="button"
            onClick={() => onSelectZone(selectedZone === zone.id ? null : zone.id)}
            style={{
              position: 'absolute',
              left: zone.x,
              top: zone.y,
              transform: 'translate(-50%, -50%)',
              width: `${zone.w}%`,
              height: `${zone.h}%`,
            }}
            className="group"
          >
            <div className={`w-full h-full rounded-lg border-2 transition-all flex items-center justify-center ${
              selectedZone === zone.id
                ? 'border-red-500 bg-red-500/20'
                : 'border-transparent hover:border-gray-300 hover:bg-gray-200/30'
            }`}>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${
                selectedZone === zone.id
                  ? 'bg-red-500 text-white'
                  : 'bg-white/80 text-gray-500 group-hover:bg-gray-200 group-hover:text-gray-700'
              }`}>
                {zone.label}
              </span>
            </div>
          </button>
        ))}
      </div>
      {selectedZone && (
        <p className="text-center text-sm text-red-600 font-medium mt-2">
          Selected: {ZONES.find(z => z.id === selectedZone)?.label}
        </p>
      )}
    </div>
  );
}

TugDiagram.propTypes = {
  selectedZone: PropTypes.string,
  onSelectZone: PropTypes.func.isRequired,
};
