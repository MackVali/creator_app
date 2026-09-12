"use client";

import {
  BarChart3,
  Blocks,
  Calendar,
  Grid2X2,
  ListOrdered,
  Settings,
  Timer,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const primaryItems = [
  {
    label: "Command",
    href: "/dashboard",
    Icon: Grid2X2,
    matches: ["/dashboard", "/areas", "/monuments", "/goals", "/habits", "/skills"],
  },
  {
    label: "Analytics",
    href: "/friends",
    Icon: BarChart3,
    matches: ["/friends"],
  },
  {
    label: "Schedule",
    href: "/schedule",
    Icon: Calendar,
    matches: ["/schedule"],
  },
  {
    label: "Source",
    href: "/source",
    Icon: Blocks,
    matches: ["/source"],
  },
] as const;

const utilityItems = [
  {
    label: "Priority Editor",
    href: "/schedule/priorities",
    Icon: ListOrdered,
  },
  {
    label: "FocusPomo",
    href: "/focus-pomo",
    Icon: Timer,
  },
  {
    label: "Matrix",
    href: "/schedule/matrix",
    Icon: Grid2X2,
  },
  {
    label: "Settings",
    href: "/settings",
    Icon: Settings,
  },
] as const;

function matchesRoute(pathname: string, matches: readonly string[]) {
  return matches.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function getWorkspaceMeta(pathname: string) {
  if (pathname.startsWith("/schedule/priorities")) {
    return {
      title: "Priority Editor",
      subtitle: "Decide what deserves your time.",
    };
  }

  if (pathname.startsWith("/schedule/matrix")) {
    return {
      title: "Matrix",
      subtitle: "See the shape of your day.",
    };
  }

  if (pathname.startsWith("/focus-pomo")) {
    return {
      title: "FocusPomo",
      subtitle: "Work with intention.",
    };
  }

  if (pathname.startsWith("/schedule")) {
    return {
      title: "Schedule",
      subtitle: "Turn your priorities into time.",
    };
  }

  if (pathname.startsWith("/friends")) {
    return {
      title: "Analytics",
      subtitle: "See what your effort is producing.",
    };
  }

  if (pathname.startsWith("/source")) {
    return {
      title: "Source",
      subtitle: "Your systems, tools, and resources.",
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      title: "Settings",
      subtitle: "Configure Creator.",
    };
  }

  if (pathname.startsWith("/profile")) {
    return {
      title: "Profile",
      subtitle: "Your Creator identity.",
    };
  }

  return {
    title: "Command",
    subtitle: "Build the life you want.",
  };
}

export default function DesktopShellNav() {
  const pathname = usePathname();

  return (
    <div className="group pointer-events-none fixed inset-y-0 left-0 z-50 hidden w-52 lg:block">
      <div
        aria-hidden="true"
        className="pointer-events-auto absolute inset-y-0 left-0 z-10 w-2"
      />

      <aside className="pointer-events-auto absolute inset-y-0 left-0 flex w-52 -translate-x-full flex-col border-r border-white/[0.07] bg-[#090a0b] text-white shadow-[18px_0_40px_rgba(0,0,0,0.38)] transition-transform duration-200 ease-out group-hover:translate-x-0 hover:translate-x-0">
      <div className="px-4 pb-4 pt-5">
        <div className="text-[18px] font-semibold tracking-[-0.02em]">
          Creator
        </div>
      </div>

      <nav className="flex flex-1 flex-col px-2.5">
        <div className="space-y-0.5">
          {primaryItems.map(({ label, href, Icon, matches }) => {
            const active = matchesRoute(pathname, matches);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition ${
                  active
                    ? "bg-white/[0.08] text-white"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <Icon
                  className="h-[17px] w-[17px] shrink-0"
                  strokeWidth={1.8}
                />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="my-4 border-t border-white/[0.06]" />

        <div className="space-y-0.5">
          {utilityItems.map(({ label, href, Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] transition ${
                  active
                    ? "bg-white/[0.06] text-zinc-100"
                    : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-300"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto pb-3">
          <div className="mb-2 border-t border-white/[0.06]" />

          <Link
            href="/profile"
            className="flex h-11 items-center gap-2.5 rounded-lg px-2 text-[13px] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.03]">
              <UserRound className="h-4 w-4" />
            </div>
            Profile
          </Link>
        </div>
      </nav>
      </aside>
    </div>
  );
}

export function DesktopPageHeader() {
  const pathname = usePathname();
  const { title, subtitle } = getWorkspaceMeta(pathname);

  return (
    <div className="hidden items-end justify-between px-6 pb-4 pt-5 lg:flex">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-zinc-100">
          {title}
        </h1>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
