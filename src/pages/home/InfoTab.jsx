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
    <div className="py-4">
      <TodayShiftSummaryCard
        summary={summary}
        location={selectedLocation}
        onLocationToggle={handleLocationToggle}
        locationToggleDisabled={availableLocations.length === 0}
      />
      <Suspense fallback={null}>
        <ShunterOfTheMonthCard />
        <InductionGuidePromoCard />
      </Suspense>
    </div>
  );
}
