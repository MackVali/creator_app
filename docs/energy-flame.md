# EnergyFlame Component

This app exposes an `EnergyFlame` React component that renders an animated
flame indicating a project's energy level.

## ProjectCard Integration Example

```tsx
import { EnergyFlame } from "@/components/ui/EnergyFlame";

function ProjectCard({ project }) {
  return (
    <div className="relative p-4">
      <EnergyFlame
        level={project.energy}
        className="pointer-events-none absolute top-2 right-2"
      />
      {/* card content */}
    </div>
  );
}
```

The flame sits in the top-right corner of the card, above other content, and
uses the project's `energy` field to determine the animation style.

