"use client";

import { useRouter } from "next/navigation";
import type { DashboardData } from "@/types/dashboard";

interface ClientDashboardProps {
  data: DashboardData;
}

// Example client component using the hook
export function ClientDashboard({ data }: ClientDashboardProps) {
  const router = useRouter();
  const { userStats, monuments, skillsAndGoals } = data;

  // Debug logging
  console.log("🔍 Dashboard Data:", data);
  console.log("🎯 Skills and Goals:", skillsAndGoals);
  console.log("🐱 Categories:", skillsAndGoals.cats);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1E1E1E", // Exact dark grey from mockup
        color: "#E0E0E0", // Exact light grey text from mockup
        padding: "0",
      }}
    >
      {/* Hero Section with Mountain Background */}
      <div style={{ position: "relative" }}>
        {/* Mountain Background */}
        <div
          style={{
            height: "160px",
            background: "#2A2A2A", // Exact mountain background from mockup
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Subtle mountain silhouettes using SVG-like shapes */}
          <div style={{ position: "absolute", inset: "0" }}>
            <svg
              style={{ width: "100%", height: "100%" }}
              viewBox="0 0 1200 160"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient
                  id="mountain1"
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#333" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#333" stopOpacity="0.6" />
                </linearGradient>
                <linearGradient
                  id="mountain2"
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#333" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#333" stopOpacity="0.5" />
                </linearGradient>
                <linearGradient
                  id="mountain3"
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#333" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#333" stopOpacity="0.4" />
                </linearGradient>
              </defs>
              {/* Mountain peaks */}
              <path
                d="M0 160 L200 80 L400 120 L600 60 L800 100 L1000 40 L1200 80 L1200 160 Z"
                fill="url(#mountain1)"
              />
              <path
                d="M0 160 L150 100 L300 140 L450 80 L600 120 L750 60 L900 100 L1050 80 L1200 120 L1200 160 Z"
                fill="url(#mountain2)"
              />
              <path
                d="M0 160 L100 120 L200 140 L300 100 L400 140 L500 80 L600 120 L700 100 L800 140 L900 80 L1000 120 L1100 100 L1200 140 L1200 160 Z"
                fill="url(#mountain3)"
              />
            </svg>
          </div>
        </div>

        {/* Level Display */}
        <div style={{ position: "absolute", bottom: "16px", left: "24px" }}>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "900",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#E0E0E0",
            }}
          >
            LEVEL {userStats.level}
          </div>
          <div
            style={{
              marginTop: "8px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                width: "192px", // Smaller for mobile
                height: "12px",
                background: "#333", // Exact dark grey from mockup
                borderRadius: "9999px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "#BBB", // Exact light grey from mockup
                  borderRadius: "9999px",
                  transition: "width 0.5s ease-out",
                  width: `${(userStats.xp_current / userStats.xp_max) * 100}%`,
                }}
              ></div>
            </div>
            <span
              style={{
                fontSize: "12px",
                color: "#A0A0A0", // Exact color from mockup
              }}
            >
              {userStats.xp_current} / {userStats.xp_max}
            </span>
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div style={{ padding: "24px 16px", paddingBottom: "32px" }}>
        {/* Monuments Section */}
        <div style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: "900",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "16px",
              color: "#E0E0E0",
            }}
          >
            MONUMENTS
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "16px",
            }}
          >
            <div
              style={{
                background: "#2C2C2C", // Exact card background from mockup
                borderRadius: "8px",
                padding: "16px",
                textAlign: "center",
                border: "1px solid #333",
              }}
            >
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>🏆</div>
              <div
                style={{
                  fontWeight: "500",
                  fontSize: "14px",
                  marginBottom: "4px",
                  color: "#E0E0E0",
                }}
              >
                Achievement
              </div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: "900",
                  color: "#A0A0A0",
                }}
              >
                {monuments.Achievement}
              </div>
            </div>
            <div
              style={{
                background: "#2C2C2C",
                borderRadius: "8px",
                padding: "16px",
                textAlign: "center",
                border: "1px solid #333",
              }}
            >
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>🎗️</div>
              <div
                style={{
                  fontWeight: "500",
                  fontSize: "14px",
                  marginBottom: "4px",
                  color: "#E0E0E0",
                }}
              >
                Legacy
              </div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: "900",
                  color: "#A0A0A0",
                }}
              >
                {monuments.Legacy}
              </div>
            </div>
            <div
              style={{
                background: "#2C2C2C",
                borderRadius: "8px",
                padding: "16px",
                textAlign: "center",
                border: "1px solid #333",
              }}
            >
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>⭐</div>
              <div
                style={{
                  fontWeight: "500",
                  fontSize: "14px",
                  marginBottom: "4px",
                  color: "#E0E0E0",
                }}
              >
                Triumph
              </div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: "900",
                  color: "#A0A0A0",
                }}
              >
                {monuments.Triumph}
              </div>
            </div>
            <div
              style={{
                background: "#2C2C2C",
                borderRadius: "8px",
                padding: "16px",
                textAlign: "center",
                border: "1px solid #333",
              }}
            >
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>🏔️</div>
              <div
                style={{
                  fontWeight: "500",
                  fontSize: "14px",
                  marginBottom: "4px",
                  color: "#E0E0E0",
                }}
              >
                Pinnacle
              </div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: "900",
                  color: "#A0A0A0",
                }}
              >
                {monuments.Pinnacle}
              </div>
            </div>
          </div>
        </div>

        {/* Skills Section */}
        <div style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: "900",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "16px",
              color: "#E0E0E0",
              cursor: "pointer",
            }}
            onClick={() => (window.location.href = "/skills")}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#BBB")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#E0E0E0")}
          >
            SKILLS
          </h2>
          <div className="flex flex-wrap gap-4">
            {skillsAndGoals.cats && skillsAndGoals.cats.length > 0 ? (
              skillsAndGoals.cats.map((cat) => {
                const color = cat.color || "#353535";
                const bg = cat.color ? `${cat.color}20` : "#242424";
                return (
                  <div
                    key={cat.cat_id}
                    className="w-full sm:w-1/2 md:w-1/3 lg:w-1/5"
                  >
                    <div
                      className="rounded-lg border p-2"
                      style={{ borderColor: color, backgroundColor: bg }}
                    >
                      <div className="mb-2 text-center text-sm font-semibold text-[#E6E6E6] truncate">
                        {cat.cat_name}
                      </div>
                      <div className="flex flex-col gap-1">
                        {cat.skills && cat.skills.length > 0 ? (
                          cat.skills.map((skill) => (
                            <div
                              key={skill.skill_id}
                              className="flex items-center gap-2 rounded px-2 py-1 text-[#E6E6E6] hover:bg-[#2B2B2B] active:scale-[0.98] transition transform"
                            >
                              <span className="text-base">
                                {skill.icon || "💡"}
                              </span>
                              <span className="truncate text-sm">
                                {skill.name}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-center text-xs text-[#808080]">
                            No skills
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-[#808080]">
                No skills found. Create your first skill to get started!
              </div>
            )}
          </div>
        </div>

        {/* Current Goals Section */}
        <div>
          <h2
            onClick={() => router.push("/goals")}
            style={{
              fontSize: "18px",
              fontWeight: "900",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "16px",
              color: "#E0E0E0",
              cursor: "pointer",
              transition: "color 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#FFFFFF")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#E0E0E0")}
          >
            CURRENT GOALS
          </h2>
          <div
            style={{
              background: "#2C2C2C",
              borderRadius: "8px",
              padding: "16px",
              border: "1px solid #333",
            }}
          >
            <ul style={{ margin: "0", padding: "0", listStyle: "none" }}>
              {skillsAndGoals.goals.map(
                (goal: { id: string; name: string; created_at?: string }) => (
                  <li
                    key={goal.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "8px 0",
                      borderBottom: "1px solid #333",
                    }}
                  >
                    <div
                      style={{
                        width: "6px",
                        height: "6px",
                        background: "#A0A0A0",
                        borderRadius: "50%",
                        flexShrink: "0",
                      }}
                    ></div>
                    <span
                      style={{
                        fontWeight: "500",
                        fontSize: "14px",
                        color: "#E0E0E0",
                      }}
                    >
                      {goal.name}
                    </span>
                  </li>
                )
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
