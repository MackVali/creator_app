"use client";

import { useState, useEffect } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  PageHeader,
  ContentCard,
  GridContainer,
  GridSkeleton,
  useToastHelpers,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Plus, Trophy, Award, Star, Crown } from "lucide-react";

interface Monument {
  id: string;
  name: string;
  description: string;
  type: "Achievement" | "Legacy" | "Triumph" | "Pinnacle";
  earnedDate: string;
  category: string;
  rarity: "common" | "rare" | "epic" | "legendary";
}

export default function MonumentsPage() {
  return (
    <div className="p-6 text-white">
      <h1>Monuments Page</h1>
      <p>Coming soon...</p>
    </div>
  );
}
