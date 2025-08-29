"use client";

import LinkedAccountsForm from "./LinkedAccountsForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LinkedAccountsPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="flex items-center space-x-4 mb-6">
        <Link href="/profile">
          <Button variant="ghost" size="sm" className="p-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Linked Accounts</h1>
      </div>
      <LinkedAccountsForm />
    </div>
  );
}
