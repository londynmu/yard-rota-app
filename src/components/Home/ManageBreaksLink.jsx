import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

export default function ManageBreaksLink({ className = '' }) {
  return (
    <Link
      to="/brakes"
      className={`inline-flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-medium rounded-xl bg-white/90 backdrop-blur-sm border-2 border-rota-btn-outline-border text-charcoal hover:border-charcoal/40 hover:bg-white hover:shadow-md transition-all duration-200 active:scale-[0.99] ${className}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-charcoal/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Manage my breaks
    </Link>
  );
}

ManageBreaksLink.propTypes = {
  className: PropTypes.string,
};
