import FlameEmber, { type EnergyLevel } from "@/components/FlameEmber";

const levels: EnergyLevel[] = ["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"];

export default function HelpPage() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Energy Levels</h1>
      <ul className="mt-4 space-y-4">
        {levels.map((level) => (
          <li key={level} className="flex items-center gap-3">
            <FlameEmber level={level} size="lg" />
            <span className="capitalize">{level.toLowerCase()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
