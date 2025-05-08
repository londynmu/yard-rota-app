import React from 'react';
import { useToast } from './ToastContext';

const ToastDemo = () => {
  const toast = useToast();

  return (
    <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 max-w-md mx-auto">
      <h2 className="text-lg font-medium text-white mb-4">Toast Notification Demo</h2>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => toast.success('Success notification!')}
          className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
        >
          Success
        </button>
        <button
          onClick={() => toast.error('Error notification!')}
          className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          Error
        </button>
        <button
          onClick={() => toast.warning('Warning notification!')}
          className="px-3 py-1.5 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors"
        >
          Warning
        </button>
        <button
          onClick={() => toast.info('Info notification!')}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Info
        </button>
        <button
          onClick={() => toast.showToast('Custom notification!', 'success')}
          className="px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
        >
          Custom
        </button>
      </div>
    </div>
  );
};

export default ToastDemo; 