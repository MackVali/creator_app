"use client";

import type { DashboardData } from "@/types/dashboard";

interface ClientDashboardProps {
  data: DashboardData;
}

// Example client component using the hook
export function ClientDashboard({ data }: ClientDashboardProps) {
  const { userStats, monuments, skillsAndGoals } = data;

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
            }}
          >
            SKILLS
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "16px",
            }}
          >
            {skillsAndGoals.skills.map(
              (skill: {
                skill_id: string | number;
                name: string;
                progress: number;
              }) => (
                <div
                  key={skill.skill_id}
                  style={{
                    background: "#2C2C2C",
                    borderRadius: "8px",
                    padding: "16px",
                    border: "1px solid #333",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    <div style={{ fontSize: "20px" }}>
                      {skill.name === "Writing" && "✏️"}
                      {skill.name === "Time Management" && "⏰"}
                      {skill.name === "Public Speaking" && "📢"}
                      {skill.name === "Problem Solving" && "🧩"}
                      {skill.name === "Music" && "🎵"}
                      {skill.name === "Guitar" && "🎸"}
                      {![
                        "Writing",
                        "Time Management",
                        "Public Speaking",
                        "Problem Solving",
                        "Music",
                        "Guitar",
                      ].includes(skill.name) && "💡"}
                    </div>
                    <span
                      style={{
                        fontWeight: "500",
                        fontSize: "14px",
                        color: "#E0E0E0",
                      }}
                    >
                      {skill.name}
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "8px",
                      background: "#333",
                      borderRadius: "9999px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        background: "#BBB",
                        borderRadius: "9999px",
                        transition: "width 0.7s ease-out",
                        width: `${skill.progress}%`,
                      }}
                    ></div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Current Goals Section */}
        <div>
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
                (goal: {
                  goal_id: string | number;
                  name: string;
                  updated_at?: string;
                }) => (
                  <li
                    key={goal.goal_id}
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
