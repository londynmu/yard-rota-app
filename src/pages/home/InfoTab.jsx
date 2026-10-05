import React, { Suspense } from 'react';
import TodayShiftSummaryCard from '../../components/Home/TodayShiftSummaryCard';
import { useBreaksFilters } from '../../hooks/useBreaksFilters';
import { useTodayShiftSummary } from '../../hooks/useTodayShiftSummary';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const ShunterOfTheMonthCard = lazyWithRetry(() => import('../../components/User/ShunterOfTheMonthCard'));
const InductionGuidePromoCard = lazyWithRetry(() => import('../../components/InductionGuide/InductionGuidePromoCard'));

/** Mobile Home → Info: today's yard headcount, Shunter of the Month and the Shunter Guide. */
export default function InfoTab() {
  const { availableLocations, selectedLocation, handleLocationToggle } = useBreaksFilters();
  const summary = useTodayShiftSummary(selectedLocation);

  return (
    <div className="px-4 py-4">
      <div className="max-w-4xl mx-auto space-y-3">
        <TodayShiftSummaryCard
          summary={summary}
          location={selectedLocation}
          onLocationToggle={handleLocationToggle}
          locationToggleDisabled={availableLocations.length === 0}
        />
        <div className="card-modern divide-y divide-slate-200/60">
          <Suspense fallback={null}>
            <ShunterOfTheMonthCard variant="row" />
            <InductionGuidePromoCard variant="row" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
