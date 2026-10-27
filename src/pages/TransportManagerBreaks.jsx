import React from 'react';
import BrakesManager from '../components/Admin/Brakes/BrakesManager';

/**
 * Transport Manager Breaks — same planned-slot board as admin, view only.
 */
export default function TransportManagerBreaks() {
  return (
    <div className="min-h-screen bg-transparent">
      <BrakesManager readOnly />
    </div>
  );
}
