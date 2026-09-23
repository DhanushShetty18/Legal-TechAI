"use client";

import AppSidebar from "@/components/AppSidebar";

export default function ApiExplorerPage() {
    return (
        <div className="min-h-screen flex bg-slate-50">
            <AppSidebar />
            <main className="flex-1 flex flex-col h-screen">
                <header className="bg-white border-b border-slate-200 px-8 py-6">
                    <h1 className="text-2xl font-bold text-slate-900">API Explorer</h1>
                    <p className="text-slate-500 text-sm">Interactive Swagger UI for the Legal-TechAI Backend</p>
                </header>
                <div className="flex-1 w-full h-full p-4">
                    <div className="w-full h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <iframe 
                            src="https://legal-techai.onrender.com/docs" 
                            className="w-full h-full border-none"
                            title="Swagger API Documentation"
                        />
                    </div>
                </div>
            </main>
        </div>
    );
}
