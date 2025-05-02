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
        className="text-gray-400 hover:text-gray-600 focus:outline-none ml-2"
        aria-label="More information"
      >
        ℹ️
      </button>
      {visible && (
        <div className="absolute z-10 w-64 p-2 text-sm text-white bg-gray-800/90 backdrop-blur-sm rounded-md shadow-lg left-6 top-1/2 transform -translate-y-1/2">
          {message}
        </div>
      )}
    </div>
  );
}

Tooltip.propTypes = {
  message: PropTypes.string.isRequired,
}; 