"use client";

import { useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import { Send, Bot, User, Loader2, AlertTriangle } from "lucide-react";

export default function LegalQAPage() {
    const [question, setQuestion] = useState("");
    const [messages, setMessages] = useState<{role: 'user'|'assistant', content: string, citations?: string[], warnings?: string[]}[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!question.trim()) return;

        const userMsg = question;
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setQuestion("");
        setLoading(true);

        try {
            const res = await fetch("https://legal-techai.onrender.com/rag/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: userMsg })
            });

            if (!res.ok) throw new Error("Failed to get response");
            
            const data = await res.json();
            
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: data.answer || "No answer found.",
                citations: data.citations || [],
                warnings: data.hallucination_flags || []
            }]);
        } catch (err: any) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-slate-50">
            <AppSidebar />
            <main className="flex-1 flex flex-col h-screen">
                <header className="bg-white border-b border-slate-200 px-8 py-6 shrink-0">
                    <h1 className="text-2xl font-bold text-slate-900">Legal Q&A (BNS/BNSS/BSA)</h1>
                    <p className="text-slate-500 text-sm">Ask questions about the new Indian criminal codes.</p>
                </header>
                
                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <Bot className="h-16 w-16 mb-4 opacity-20" />
                            <p className="text-lg">How can I assist you with the new criminal codes?</p>
                            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl w-full">
                                <button onClick={() => setQuestion("What is the penalty for cyber terrorism?")} className="p-4 bg-white border border-slate-200 rounded-xl text-left hover:border-indigo-500 hover:shadow-sm transition-all text-sm text-slate-600">
                                    "What is the penalty for cyber terrorism?"
                                </button>
                                <button onClick={() => setQuestion("How has the law on sedition changed?")} className="p-4 bg-white border border-slate-200 rounded-xl text-left hover:border-indigo-500 hover:shadow-sm transition-all text-sm text-slate-600">
                                    "How has the law on sedition changed?"
                                </button>
                            </div>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={i} className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'justify-end' : ''}`}>
                            {msg.role === 'assistant' && (
                                <div className="h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                                    <Bot className="h-6 w-6 text-indigo-600" />
                                </div>
                            )}
                            
                            <div className={`p-5 rounded-2xl max-w-[80%] ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'}`}>
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                
                                {msg.citations && msg.citations.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-slate-100">
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Citations</p>
                                        <ul className="list-disc pl-4 space-y-1">
                                            {msg.citations.map((c, idx) => (
                                                <li key={idx} className="text-sm text-slate-500">{c}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {msg.warnings && msg.warnings.length > 0 && (
                                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                        <div className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-1">
                                            <AlertTriangle className="h-4 w-4" /> Hallucination Warning
                                        </div>
                                        <ul className="list-disc pl-5 space-y-1 text-sm text-amber-700">
                                            {msg.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {msg.role === 'user' && (
                                <div className="h-10 w-10 bg-slate-800 rounded-full flex items-center justify-center shrink-0">
                                    <User className="h-5 w-5 text-white" />
                                </div>
                            )}
                        </div>
                    ))}
                    {loading && (
                        <div className="flex gap-4 max-w-4xl mx-auto">
                            <div className="h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                                <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
                            </div>
                            <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none shadow-sm text-slate-500 flex items-center gap-2">
                                Analyzing legal codes...
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-white border-t border-slate-200 shrink-0">
                    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
                        <input
                            type="text"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Ask any question about the new Indian criminal codes..."
                            className="w-full bg-slate-50 border border-slate-300 rounded-full py-4 pl-6 pr-16 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner"
                            disabled={loading}
                        />
                        <button
                            type="submit"
                            disabled={!question.trim() || loading}
                            className="absolute right-2 top-2 h-10 w-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-full flex items-center justify-center transition-colors"
                        >
                            <Send className="h-5 w-5 -ml-0.5" />
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}
