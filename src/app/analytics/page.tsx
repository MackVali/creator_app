"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { SummaryHeader } from "./_components/SummaryHeader";
import PlusRoute from "@/components/auth/PlusRoute";

// Lazy load the existing dashboard sections
const AnalyticsDashboard = dynamic(
  () => import("@/components/AnalyticsDashboard")
);

const navItems = [
  { id: "summary", label: "Summary", href: "#summary" },
  { id: "planning", label: "Planning", href: "#planning" },
  { id: "trends", label: "Trends", href: "#trends" },
  { id: "logs", label: "Logs", href: "#logs" },
];

export default function AnalyticsPage() {
  const [activeSection, setActiveSection] = useState("summary");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelContent, setSidePanelContent] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        let current = "";
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            current = entry.target.id;
          }
        });
        if (current) {
          setActiveSection(current);
        }
      },
      {
        rootMargin: "-50% 0px -50% 0px",
        threshold: 0,
      }
    );

    observerRef.current = observer;

    // Observe sections
    navItems.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleDrilldown = (kpiId: string) => {
    setSidePanelContent(`Drilldown for ${kpiId} - Coming soon!`);
    setSidePanelOpen(true);
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <PlusRoute>
      <div className="relative">
      {/* Sticky Navigation */}
      <nav className="sticky top-0 z-40 border-b border-zinc-900 bg-black/40 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center">
            <div className="flex space-x-1">
              {navItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        {/* Summary Section */}
        <section className="mb-16">
          <SummaryHeader onDrilldown={handleDrilldown} />
        </section>

        {/* Existing Dashboard Sections - Lazy Loaded */}
        <Suspense
          fallback={
            <div className="py-16 text-center text-zinc-400">Loading...</div>
          }
        >
          <AnalyticsDashboard />
        </Suspense>
      </div>

      {/* Side Panel Placeholder */}
      {sidePanelOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-96 border-l border-zinc-800 bg-zinc-950 p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Drilldown</h3>
            <button
              onClick={() => setSidePanelOpen(false)}
              className="text-zinc-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="mt-4 text-zinc-300">{sidePanelContent}</div>
        </div>
      )}
      </div>
    </PlusRoute>
  );
}
