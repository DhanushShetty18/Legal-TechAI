import Link from "next/link";
import { ClipboardCheck, FileInput, GitCompare, Landmark } from "lucide-react";
import { GAME_CHANGERS, type GameChangerId } from "@/lib/game-changers";

const ICONS: Record<GameChangerId, typeof Landmark> = {
  "stamp-duty": Landmark,
  "e-filing-readiness": ClipboardCheck,
  "contradiction-finder": GitCompare,
  "form-hydration": FileInput,
};

export default function ModuleGrid() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {GAME_CHANGERS.map((module) => {
        const Icon = ICONS[module.id];
        return (
          <Link
            key={module.id}
            href={module.href}
            className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-indigo-500 hover:shadow-xl"
          >
            <div className="mb-4 inline-flex rounded-xl bg-indigo-600 p-3 text-white">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="text-lg font-bold text-slate-900">{module.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{module.summary}</p>
            <p className="mt-3 text-xs font-medium text-slate-500">{module.needs}</p>
          </Link>
        );
      })}
    </div>
  );
}
