export default function Page() {
  return (
    <div className="p-6 space-y-4">
      <div className="text-3xl font-bold">CSS Debug</div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-500 h-10 rounded" />
        <div className="bg-purple-500 h-10 rounded" />
        <div className="bg-rose-500 h-10 rounded" />
      </div>
      <button className="px-4 py-2 rounded-md bg-zinc-900 text-white data-[state=open]:bg-zinc-700">
        Button
      </button>
    </div>
  );
}
