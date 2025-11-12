import React from 'react';
import BrakesManager from '../components/Admin/Brakes/BrakesManager';

const BrakesPage = () => {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <BrakesManager />
      </div>
    </div>
  );
};

export default BrakesPage; 