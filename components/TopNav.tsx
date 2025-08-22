"use client";

import { Menu } from "lucide-react";

interface TopNavProps {
  username: string;
}

export default function TopNav({ username }: TopNavProps) {
  const toggleSidebar = () => {
    // Placeholder for future sidebar toggle
    console.log("toggle sidebar");
  };

  return (
    <nav className="w-full flex items-center justify-between px-4 py-2 bg-gray-900 text-white">
      <button onClick={toggleSidebar} className="p-2 hover:text-blue-400">
        <Menu className="h-6 w-6" />
      </button>
      <span className="font-semibold" data-testid="username">
        {username}
      </span>
      <div className="h-8 w-8 rounded-full bg-gray-700" />
    </nav>
  );
}

