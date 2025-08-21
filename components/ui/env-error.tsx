"use client"

import { AlertTriangle, Copy, ExternalLink } from "lucide-react"
import { Button } from "./button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card"

interface EnvErrorProps {
  missingVars: string[]
}

export function EnvError({ missingVars }: EnvErrorProps) {
  const copyToClipboard = () => {
    const envContent = missingVars
      .map(varName => `${varName}=your_${varName.toLowerCase().replace('next_public_supabase_', '')}_here`)
      .join('\n')
    
    navigator.clipboard.writeText(envContent)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0b0c] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-xl">Environment Variables Missing</CardTitle>
          <CardDescription>
            The following Supabase environment variables are required:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {missingVars.map((varName) => (
              <div
                key={varName}
                className="rounded-md bg-muted px-3 py-2 font-mono text-sm"
              >
                {varName}
              </div>
            ))}
          </div>
          
          <div className="space-y-3">
            <Button onClick={copyToClipboard} className="w-full gap-2">
              <Copy className="h-4 w-4" />
              Copy Template to Clipboard
            </Button>
            
            <Button variant="outline" asChild className="w-full gap-2">
              <a
                href="https://supabase.com/docs/guides/getting-started/environment-variables"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                View Supabase Docs
              </a>
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground text-center">
            Create a <code className="rounded bg-muted px-1">.env.local</code> file in your project root
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
