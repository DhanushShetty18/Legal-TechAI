import Link from "next/link";
import { Camera, Search, ShieldCheck, Scale, FileSearch, BrainCircuit, Activity, Landmark } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-amber-100 selection:text-amber-900">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-indigo-900" />
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Legal-TechAI
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link href="#" className="hover:text-indigo-900 transition-colors">
              About
            </Link>
            <Link href="#" className="hover:text-indigo-900 transition-colors">
              Public Data
            </Link>
            <Link
              href="#"
              className="px-4 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              Employee Login
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="mb-6 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm text-amber-800">
          <ShieldCheck className="mr-2 h-4 w-4" />
          <span>secure • immutable • verified</span>
        </div>

        <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl max-w-4xl">
          National-Scale <span className="text-indigo-900">Digital Judicial Infrastructure</span>
        </h1>

        <p className="max-w-2xl text-lg text-slate-600 mb-10">
          A unified system ensuring speed, transparency, and constitutional integrity for every citizen.
          AI assists, humans decide.
        </p>

        {/* Action Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 max-w-4xl w-full">
          {/* File Case Card */}
          <Link href="/file-case" className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 hover:border-indigo-500 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 h-32 w-32 rounded-full bg-indigo-50 group-hover:bg-indigo-100 transition-colors"></div>
            <div className="relative z-10 flex flex-col items-start text-left">
              <div className="mb-4 rounded-xl bg-indigo-600 p-3 text-white shadow-lg shadow-indigo-200">
                <Camera className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">File a New Case</h3>
              <p className="text-slate-500 text-sm">
                Capture evidence securely via live camera. No gallery uploads allowed to ensure authenticity.
              </p>
            </div>
          </Link>

          {/* Search Case Card */}
          <Link href="/search-case" className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 hover:border-emerald-500 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 h-32 w-32 rounded-full bg-emerald-50 group-hover:bg-emerald-100 transition-colors"></div>
            <div className="relative z-10 flex flex-col items-start text-left">
              <div className="mb-4 rounded-xl bg-emerald-600 p-3 text-white shadow-lg shadow-emerald-200">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Search Cases</h3>
              <p className="text-slate-500 text-sm">
                Track status instantly with case number. Transparent and accessible for all citizens.
              </p>
            </div>
          </Link>
        </div>

        {/* Investor Showcase / Dashboard Cards */}
        <div className="mt-12 w-full max-w-5xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-px bg-slate-200 flex-1"></div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Investor Showcase Modules</h2>
            <div className="h-px bg-slate-200 flex-1"></div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/inconsistency" className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 hover:border-blue-500 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="absolute top-0 right-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-blue-50 group-hover:bg-blue-100 transition-colors"></div>
              <div className="relative z-10 flex flex-col items-start text-left">
                <div className="mb-4 rounded-xl bg-blue-600 p-3 text-white shadow-lg shadow-blue-200">
                  <FileSearch className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Inconsistency Detector</h3>
                <p className="text-slate-500 text-xs">Cross-examine two documents for AI-detected factual contradictions.</p>
              </div>
            </Link>

            <Link href="/legal-qa" className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 hover:border-purple-500 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="absolute top-0 right-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-purple-50 group-hover:bg-purple-100 transition-colors"></div>
              <div className="relative z-10 flex flex-col items-start text-left">
                <div className="mb-4 rounded-xl bg-purple-600 p-3 text-white shadow-lg shadow-purple-200">
                  <BrainCircuit className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Legal Q&A</h3>
                <p className="text-slate-500 text-xs">AI Chat Assistant trained on the new BNS, BNSS, and BSA criminal codes.</p>
              </div>
            </Link>

            <Link href="/api-explorer" className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 hover:border-orange-500 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="absolute top-0 right-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-orange-50 group-hover:bg-orange-100 transition-colors"></div>
              <div className="relative z-10 flex flex-col items-start text-left">
                <div className="mb-4 rounded-xl bg-orange-600 p-3 text-white shadow-lg shadow-orange-200">
                  <Activity className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">API Explorer</h3>
                <p className="text-slate-500 text-xs">Test endpoints directly via the embedded Swagger interactive UI.</p>
              </div>
            </Link>

            <Link href="/judge-dashboard" className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 hover:border-amber-500 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="absolute top-0 right-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-amber-50 group-hover:bg-amber-100 transition-colors"></div>
              <div className="relative z-10 flex flex-col items-start text-left">
                <div className="mb-4 rounded-xl bg-amber-600 p-3 text-white shadow-lg shadow-amber-200">
                  <Scale className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Judge Dashboard</h3>
                <p className="text-slate-500 text-xs">Judicial interface for viewing AI-generated case summaries and readiness.</p>
              </div>
            </Link>

            <Link href="/stamp-duty" className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 hover:border-emerald-500 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              <div className="absolute top-0 right-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-emerald-50 group-hover:bg-emerald-100 transition-colors"></div>
              <div className="relative z-10 flex flex-col items-start text-left">
                <div className="mb-4 rounded-xl bg-emerald-600 p-3 text-white shadow-lg shadow-emerald-200">
                  <Landmark className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Stamp Duty Engine</h3>
                <p className="text-slate-500 text-xs">Calculate stamp duty & registration charges for any Indian state instantly.</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Stats / Trust Modifiers */}
        <div className="mt-20 grid grid-cols-2 gap-8 text-center sm:grid-cols-4 max-w-5xl w-full border-t border-slate-100 pt-10">
          <div>
            <div className="text-3xl font-bold text-slate-900">0%</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1">Forgery Risk</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-900">100%</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1">Immutable Logs</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-900">24/7</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1">Accessibility</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-900">AI</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1">Assisted Review</div>
          </div>
        </div>
      </main>
    </div>
  );
}
