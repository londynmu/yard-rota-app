import React from 'react';
import BrakesManager from '../components/Admin/Brakes/BrakesManager';

const BrakesPage = () => {
  return (
    <div className="min-h-screen bg-gray-100 pt-safe">
      <div className="container mx-auto px-4 py-4 md:py-6">
        <BrakesManager />
      </div>
    </div>
  );
};

export default BrakesPage; 