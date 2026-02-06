import React from 'react';
import PropTypes from 'prop-types';

const ZONES = [
  { id: 'front', label: 'Front' },
  { id: 'left', label: 'Left Side' },
  { id: 'cab', label: 'Cab' },
  { id: 'right', label: 'Right Side' },
  { id: 'rear', label: 'Rear' },
  { id: 'interior', label: 'Interior' },
];

// Hitbox areas for each zone (x, y, width, height in SVG coords)
const HITBOXES = {
  front:    { x: 55, y: 0,   w: 90, h: 45 },
  left:     { x: 0,  y: 40,  w: 55, h: 160 },
  cab:      { x: 55, y: 40,  w: 90, h: 80 },
  right:    { x: 145,y: 40,  w: 55, h: 160 },
  rear:     { x: 55, y: 165, w: 90, h: 45 },
  interior: { x: 65, y: 120, w: 70, h: 50 },
};

const SVG_W = 200;
const SVG_H = 210;

export default function TugDiagram({ selectedZone, onSelectZone }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-2">Tap damage location</label>
      <div className="relative w-full max-w-[240px] mx-auto">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">

          {/* ===== TRACTOR UNIT - TOP VIEW (cab-over style) ===== */}

          {/* Main body outline */}
          <rect x="35" y="22" width="130" height="170" rx="8" 
            fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />

          {/* Cab section (front half) */}
          <rect x="40" y="27" width="120" height="85" rx="6" 
            fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />

          {/* Windshield */}
          <rect x="50" y="32" width="100" height="30" rx="5" 
            fill="#bfdbfe" stroke="#7dd3fc" strokeWidth="1" />
          {/* Windshield wiper lines */}
          <line x1="80" y1="55" x2="65" y2="38" stroke="#93c5fd" strokeWidth="0.7" />
          <line x1="120" y1="55" x2="135" y2="38" stroke="#93c5fd" strokeWidth="0.7" />

          {/* Dashboard area */}
          <rect x="50" y="65" width="100" height="12" rx="3" 
            fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.8" />

          {/* Seats */}
          <rect x="60" y="80" width="30" height="24" rx="4" 
            fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.8" />
          <rect x="110" y="80" width="30" height="24" rx="4" 
            fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.8" />

          {/* Fifth wheel / coupling plate */}
          <rect x="60" y="135" width="80" height="40" rx="5" 
            fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
          <circle cx="100" cy="155" r="16" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
          <circle cx="100" cy="155" r="3" fill="#94a3b8" />

          {/* Front bumper */}
          <rect x="38" y="18" width="124" height="8" rx="3" 
            fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />

          {/* Rear bumper */}
          <rect x="45" y="188" width="110" height="6" rx="2" 
            fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.8" />

          {/* Headlights */}
          <rect x="42" y="19" width="12" height="6" rx="2" fill="#fef9c3" stroke="#eab308" strokeWidth="0.7" />
          <rect x="146" y="19" width="12" height="6" rx="2" fill="#fef9c3" stroke="#eab308" strokeWidth="0.7" />

          {/* Tail lights */}
          <rect x="48" y="189" width="10" height="4" rx="1.5" fill="#fecaca" stroke="#ef4444" strokeWidth="0.5" />
          <rect x="142" y="189" width="10" height="4" rx="1.5" fill="#fecaca" stroke="#ef4444" strokeWidth="0.5" />

          {/* Side mirrors */}
          <rect x="22" y="30" width="16" height="8" rx="2" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" />
          <line x1="35" y1="34" x2="38" y2="34" stroke="#94a3b8" strokeWidth="1" />
          <rect x="162" y="30" width="16" height="8" rx="2" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" />
          <line x1="162" y1="34" x2="165" y2="34" stroke="#94a3b8" strokeWidth="1" />

          {/* Front wheels (single) */}
          <rect x="22" y="50" width="16" height="40" rx="5" fill="#475569" stroke="#1e293b" strokeWidth="1" />
          <rect x="162" y="50" width="16" height="40" rx="5" fill="#475569" stroke="#1e293b" strokeWidth="1" />
          {/* Front wheel treads */}
          {[55,62,69,76,83].map(y => (
            <React.Fragment key={y}>
              <line x1="24" y1={y} x2="36" y2={y} stroke="#64748b" strokeWidth="0.5" />
              <line x1="164" y1={y} x2="176" y2={y} stroke="#64748b" strokeWidth="0.5" />
            </React.Fragment>
          ))}

          {/* Rear wheels (dual / twin) */}
          <rect x="22" y="150" width="16" height="36" rx="5" fill="#475569" stroke="#1e293b" strokeWidth="1" />
          <rect x="10" y="153" width="14" height="30" rx="4" fill="#475569" stroke="#1e293b" strokeWidth="0.8" />
          <rect x="162" y="150" width="16" height="36" rx="5" fill="#475569" stroke="#1e293b" strokeWidth="1" />
          <rect x="176" y="153" width="14" height="30" rx="4" fill="#475569" stroke="#1e293b" strokeWidth="0.8" />

          {/* Exhaust stacks */}
          <circle cx="158" cy="112" r="4" fill="#94a3b8" stroke="#64748b" strokeWidth="0.8" />
          <circle cx="158" cy="112" r="1.5" fill="#64748b" />

          {/* Fuel tank (left side) */}
          <rect x="26" y="110" width="12" height="30" rx="4" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" />

          {/* Labels */}
          <text x="100" y="12" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="600" fontFamily="sans-serif">FRONT</text>
          <text x="100" y="207" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="600" fontFamily="sans-serif">REAR</text>
        </svg>

        {/* Clickable hotspot overlays */}
        {ZONES.map(zone => {
          const hb = HITBOXES[zone.id];
          const isSelected = selectedZone === zone.id;
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => onSelectZone(isSelected ? null : zone.id)}
              style={{
                position: 'absolute',
                left: `${(hb.x / SVG_W) * 100}%`,
                top: `${(hb.y / SVG_H) * 100}%`,
                width: `${(hb.w / SVG_W) * 100}%`,
                height: `${(hb.h / SVG_H) * 100}%`,
              }}
              className="group"
            >
              <div className={`w-full h-full rounded-md border-2 transition-all flex items-center justify-center ${
                isSelected
                  ? 'border-red-500 bg-red-500/20'
                  : 'border-transparent hover:border-red-300 hover:bg-red-100/20'
              }`}>
                <span className={`text-[9px] font-bold px-1 rounded transition-colors ${
                  isSelected ? 'text-red-700 bg-white/80' : 'text-transparent group-hover:text-red-400'
                }`}>
                  {zone.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {selectedZone && (
        <p className="text-center text-xs text-red-600 font-medium mt-1">
          {ZONES.find(z => z.id === selectedZone)?.label}
        </p>
      )}
    </div>
  );
}

TugDiagram.propTypes = {
  selectedZone: PropTypes.string,
  onSelectZone: PropTypes.func.isRequired,
};
