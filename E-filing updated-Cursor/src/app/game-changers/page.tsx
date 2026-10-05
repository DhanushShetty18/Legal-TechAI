import ModuleGrid from "@/components/ModuleGrid";

export default function GameChangersPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-slate-900">Game changer modules</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Four tools for getting a filing ready. Stamp duty is calculated in this website. The
        contradiction finder and the form filler on these pages are local previews of the bigger
        Python engines.
      </p>
      <div className="mt-8">
        <ModuleGrid />
      </div>
    </main>
  );
}
