"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import MonumentEditDialog from "@/components/monuments/MonumentEditDialog";
import { MonumentsList } from "@/components/monuments/MonumentsList";

export default function MonumentsPage() {
  const router = useRouter();
  const [editingMonumentId, setEditingMonumentId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleOpenEdit = (id: string) => {
    setEditingMonumentId(id);
    setEditDialogOpen(true);
  };

  const handleCloseEdit = () => {
    setEditDialogOpen(false);
    setEditingMonumentId(null);
  };

  const handleSaved = () => {
    handleCloseEdit();
    router.refresh();
  };

  return (
    <main className="p-4 space-y-4">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Monuments</h1>
        <Link
          href="/monuments/new"
          className="rounded-full bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
        >
          + Add Monument
        </Link>
      </div>

      <MonumentsList createHref="/monuments/new">
        {(monuments) => (
          <ul className="space-y-3">
            {monuments.map((m) => (
              <li
                key={m.id}
                className="card flex items-center gap-3 p-3"
                style={{ borderRadius: "var(--radius-sm)" }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-2xl">
                  {m.emoji || "\uD83C\uDFDB\uFE0F"}
                </div>
                <p className="flex-1 truncate font-medium">{m.title}</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Actions for ${m.title}`}
                      className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                    >
                      <MoreVertical className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[160px]">
                    <DropdownMenuItem
                      onSelect={() => {
                        handleOpenEdit(m.id);
                      }}
                    >
                      Edit monument
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </MonumentsList>

      <MonumentEditDialog
        open={editDialogOpen}
        monumentId={editingMonumentId}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseEdit();
          }
        }}
        onSaved={handleSaved}
      />
    </main>
  );
}
