import React from 'react';
import BreaksPanel from '../../components/Home/BreaksPanel';
import ManageBreaksLink from '../../components/Home/ManageBreaksLink';
import { useBreaksFilters } from '../../hooks/useBreaksFilters';

/** Mobile Home → Breaks: manage my breaks + the live main page break list. */
export default function BreaksTab() {
  const filters = useBreaksFilters();

  return (
    <div className="h-full overflow-y-auto bg-transparent px-4 py-6 pb-6">
      <div className="page-content-inner-desktop-wide">
        <div className="min-w-0">
          {filters.showManageBreaksButton && (
            <div className="w-full pt-1 pb-3">
              <ManageBreaksLink />
            </div>
          )}

          <BreaksPanel filters={filters} />
        </div>
      </div>
    </div>
  );
}
