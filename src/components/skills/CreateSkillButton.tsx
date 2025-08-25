"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";

type MonumentOpt = { id: string; title: string };

export function CreateSkillButton({ monuments }: { monuments: MonumentOpt[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [monumentId, setMonumentId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleCreate() {
    if (!name.trim() || !icon.trim()) return;
    startTransition(async () => {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), icon: icon.trim(), monument_id: monumentId }),
      });
      if (res.ok) {
        setOpen(false);
        setName("");
        setIcon("");
        setMonumentId(null);
        router.refresh();
      } else {
        console.error(await res.text());
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>+ Create Skill</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Skill</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Pattern Making" />
          </div>
          <div>
            <label className="mb-1 block text-sm">Icon (emoji)</label>
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="e.g., 🧵" />
          </div>
          <div>
            <label className="mb-1 block text-sm">Related Monument (optional)</label>
            <Select onValueChange={(v) => setMonumentId(v)} value={monumentId ?? ""}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {monuments.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={pending || !name.trim() || !icon.trim()}>Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
