import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() => {
  return new Response(
    JSON.stringify({
      error: "scheduler_cron has been retired",
      replacement: "/api/scheduler/cron/run",
    }),
    {
      status: 410,
      headers: { "Content-Type": "application/json" },
    },
  );
});
