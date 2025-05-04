import React from 'react';
import BrakesManager from '../components/Admin/Brakes/BrakesManager';

const BrakesPage = () => {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="bg-white/5 backdrop-blur-sm p-6 rounded-xl border border-white/10 shadow-xl">
        <BrakesManager />
      </div>
    </div>
  );
};

export default BrakesPage; 