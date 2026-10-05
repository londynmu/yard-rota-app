import React from 'react';
import PropTypes from 'prop-types';

/** Red count bubble pinned to the corner of a `relative` parent (bell, nav icons). Renders nothing at 0. */
export default function CountBadge({ count, className = '-top-1 -right-1' }) {
  if (!count || count <= 0) return null;

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm ring-2 ring-white ${className}`}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

CountBadge.propTypes = {
  count: PropTypes.number,
  className: PropTypes.string,
};
