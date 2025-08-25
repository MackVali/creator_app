"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skill } from "@/types/skills";

export function SkillCard({ skill }: { skill: Skill }) {
  const percent = 5; // placeholder visual for Level 1
  return (
    <Card className="min-h-[110px]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-2xl leading-none">{skill.icon}</span>
          <span className="truncate">{skill.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-1 text-xs text-muted-foreground">Level {skill.level}</div>
        <Progress value={percent} className="h-2" />
      </CardContent>
    </Card>
  );
}
