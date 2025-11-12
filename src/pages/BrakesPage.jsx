import React from 'react';
import BrakesManager from '../components/Admin/Brakes/BrakesManager';

const BrakesPage = () => {
  return (
    <div className="min-h-screen bg-offwhite">
      <div className="container mx-auto px-4 py-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <BrakesManager />
        </div>
      </div>
    </div>
  );
};

export default BrakesPage; 