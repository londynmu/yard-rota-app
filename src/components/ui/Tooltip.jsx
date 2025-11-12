import React, { useState } from 'react';
import PropTypes from 'prop-types';

export default function Tooltip({ message }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="text-gray-400 dark:text-gray-500 hover:text-charcoal dark:hover:text-white focus:outline-none ml-2"
        aria-label="More information"
      >
        ℹ️
      </button>
      {visible && (
        <div className="absolute z-10 w-64 p-2 text-sm text-white dark:text-black bg-black dark:bg-white rounded-lg shadow-lg left-6 top-1/2 transform -translate-y-1/2">
          {message}
        </div>
      )}
    </div>
  );
}

Tooltip.propTypes = {
  message: PropTypes.string.isRequired,
}; 