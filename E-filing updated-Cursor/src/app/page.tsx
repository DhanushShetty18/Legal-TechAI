import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import ModuleGrid from "@/components/ModuleGrid";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col items-center px-4 py-16 text-center">
      <div className="mb-6 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm text-amber-800">
        <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
        secure • e-filing • stamp duty
      </div>
      <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
        File with the duty figured out first
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-slate-600">
        Legal-TechAI helps a filing move: calculate stamp duty, check the papers, spot two stories
        that cannot both be true, and put identity lines into a court form.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/stamp-duty"
          className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
        >
          Open the Stamp Duty Engine
        </Link>
        <Link
          href="/game-changers"
          className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 hover:border-slate-400"
        >
          See Game changer modules
        </Link>
      </div>

      <section className="mt-16 w-full text-left">
        <div className="mb-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-200" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
            Game changer modules
          </h2>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
        <ModuleGrid />
      </section>
    </main>
  );
}
