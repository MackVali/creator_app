"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@supabase/supabase-js";
import { useToastHelpers } from "@/components/ui/toast";

// Supported OAuth providers for linking
const PROVIDERS = ["google", "github"] as const;

type Provider = (typeof PROVIDERS)[number];

export default function SocialAccountLinker() {
  const toast = useToastHelpers();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [linked, setLinked] = useState<string[]>([]);
  const [loading, setLoading] = useState<Provider | null>(null);

  useEffect(() => {
    const loadIdentities = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.identities) {
        setLinked(
          user.identities.map((i: { provider: string }) => i.provider)
        );
      }
    };
    loadIdentities();
  }, [supabase]);

  const handleLink = async (provider: Provider) => {
    setLoading(provider);
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/profile/edit` },
    });
    if (error) {
      toast.error("Error", error.message);
    } else if (data?.url) {
      // Redirect user to complete OAuth linking
      window.location.href = data.url;
    }
    setLoading(null);
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {PROVIDERS.map((provider) => {
          const isLinked = linked.includes(provider);
          return (
            <div key={provider} className="flex items-center justify-between">
              <span className="capitalize">{provider}</span>
              {isLinked ? (
                <span className="text-sm text-green-600">Linked</span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading === provider}
                  onClick={() => handleLink(provider)}
                >
                  {loading === provider ? "Linking..." : "Link"}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

