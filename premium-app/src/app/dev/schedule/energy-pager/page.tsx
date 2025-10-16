"use client";

import EnergyPager from "@/components/schedule/EnergyPager";

export default function EnergyPagerPreview() {
  return (
    <div className="p-4">
      <EnergyPager activeIndex={2} />
    </div>
  );
}

