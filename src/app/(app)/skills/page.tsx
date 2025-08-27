"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import SkillCard from "@/components/skills/SkillCard";
import { createClient } from "@/lib/supabase/browser";
import { getSkillsForUser, type SkillRow } from "@/lib/data/skills";

function SkillsPageContent() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchSkills() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const rows = await getSkillsForUser(user.id);
    setSkills(rows);
    if (process.env.NODE_ENV !== "production") {
      console.debug("Skills count:", rows.length);
    }
    setLoading(false);
  }

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (skills.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">No skills yet</div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {skills.map((s) => (
        <SkillCard
          key={s.id}
          icon={s.icon}
          name={s.name}
          level={s.level ?? 1}
          percent={0}
          skillId={s.id}
        />
      ))}
    </div>
  );
}

export default function SkillsPage() {
  return (
    <ProtectedRoute>
      <SkillsPageContent />
    </ProtectedRoute>
  );
}
