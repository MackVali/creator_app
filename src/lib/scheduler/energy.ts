"use client";

export const ENERGY_LEVELS = ["no", "low", "medium", "high", "ultra", "extreme"] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];

export type EnergyTotals = Record<EnergyLevel, number>;

export const emptyEnergyTotals = (): EnergyTotals => ({
  no: 0,
  low: 0,
  medium: 0,
  high: 0,
  ultra: 0,
  extreme: 0,
});
