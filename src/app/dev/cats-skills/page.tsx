"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { getCatsForUser, type CatRow } from "@/lib/data/cats";
import {
  getSkillsForUser,
  groupSkillsByCat,
  type SkillRow,
} from "@/lib/data/skills";

export default function DevCatsSkillsPage() {
  const [message, setMessage] = useState<string>("Loading...");
  const [cats, setCats] = useState<CatRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [byCat, setByCat] = useState<Record<string, SkillRow[]>>({});
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMessage("Not logged in");
        return;
      }
      const [catsData, skillsData] = await Promise.all([
        getCatsForUser(user.id),
        getSkillsForUser(user.id),
      ]);
      setCats(catsData);
      setSkills(skillsData);
      const grouped = groupSkillsByCat(skillsData);
      setByCat(grouped);
      if (process.env.NODE_ENV !== "production") {
        console.debug("cats", catsData.slice(0, 3));
        console.debug("skills", skillsData.slice(0, 3));
      }
      setMessage("");
    }
    load();
  }, [supabase]);

  if (message) {
    return <div className="p-4 text-white">{message}</div>;
  }

  return (
    <div className="p-4 text-white">
      <div className="mb-4">
        {cats.length} cats / {skills.length} skills
      </div>
      <ul className="space-y-1">
        {cats.map((cat) => (
          <li key={cat.id}>
            {cat.name}: {(byCat[cat.id] ?? []).length}
          </li>
        ))}
      </ul>
      {byCat["null"] && (
        <div className="mt-4">Uncategorized: {byCat["null"].length}</div>
      )}
    </div>
  );
}
