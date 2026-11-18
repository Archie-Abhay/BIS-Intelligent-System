"use client";

import { useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import PdfViewerPane from "@/components/PdfViewerPane";
import { BookOpen, MessageSquare, X, ChevronRight, Search, User } from "lucide-react";

export default function Home() {
  const [activePdf, setActivePdf] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<number | null>(null);
  const [activeSnippet, setActiveSnippet] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const handleCitationClick = (standardNo: string, pageNumber: number, snippet?: string) => {
    setActivePdf(standardNo);
    setActivePage(pageNumber);
    setActiveSnippet(snippet || null);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* BIS Official Website Mockup */}

      {/* Top Header - Indian Govt Theme */}
      <div className="h-1 w-full bg-gradient-to-r from-orange-500 via-white to-green-600"></div>
      <div className="bg-slate-900 text-slate-200 text-[11px] py-1.5 px-4 flex justify-between items-center uppercase font-bold tracking-wider">
        <div>Government of India</div>
        <div className="flex gap-4">
          <span className="hidden sm:inline">Skip to main content</span>
          <span>A- A A+</span>
          <span>English | हिन्दी</span>
        </div>
      </div>

      {/* Main Nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow">
        <div className="max-w-7xl mx-auto px-4 py-2 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 bg-[#0d2a58] rounded-full flex items-center justify-center shadow-inner border border-slate-100">
              <BookOpen size={20} className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-2xl text-[#0d2a58] tracking-tight leading-none">BIS</span>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Bureau of Indian Standards</span>
            </div>
          </div>
          <nav className="hidden lg:flex gap-6 font-bold text-[12px] text-[#0d2a58] uppercase tracking-wider">
            <a href="#" className="hover:text-orange-600 transition-colors">Home</a>
            <a href="#" className="hover:text-orange-600 transition-colors">About Us</a>
            <a href="#" className="hover:text-orange-600 transition-colors">Standards</a>
            <a href="#" className="hover:text-orange-600 transition-colors">Conformity</a>
            <a href="#" className="hover:text-orange-600 transition-colors">Hallmarking</a>
          </nav>
          <div className="flex items-center gap-3 text-[#0d2a58]">
            <button className="hover:bg-slate-100 p-1.5 rounded-full transition-colors"><Search size={18} /></button>
            <button className="hover:bg-slate-100 p-1.5 rounded-full transition-colors"><User size={18} /></button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#0d2a58] to-[#1e4a9e] text-white relative border-b-4 border-orange-500">
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
        <div className="max-w-7xl mx-auto px-4 py-20 flex flex-col md:flex-row items-center justify-between min-h-[350px] relative z-10">
          <div className="md:w-2/3">
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 leading-snug drop-shadow-lg">
              Setting the Standards,<br /><span className="text-orange-400">Ensuring the Quality.</span>
            </h1>
            <p className="text-base md:text-xl text-blue-100 mb-8 max-w-2xl leading-relaxed">
              The National Standards Body of India, ensuring the qualities, safety, and the reliabilities of products for the harmonious development of standardization activities.
            </p>
            <div className="flex gap-4">
              <button className="bg-orange-600 text-white px-6 py-3 font-bold uppercase tracking-wider text-sm hover:bg-orange-700 transition-colors flex items-center gap-2 rounded shadow-md border border-orange-700">
                KNOW MORE <ChevronRight size={18} />
              </button>
              <button
                onClick={() => setIsChatOpen(true)}
                className="bg-white text-[#0d2a58] px-6 py-3 font-bold uppercase tracking-wider text-sm hover:bg-slate-100 transition-colors flex items-center gap-2 rounded shadow-md border border-slate-200"
              >
                ASK ASSISTANT <MessageSquare size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Info Cards */}
      <section className="py-16 max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-6 border-t-4 border-[#0d2a58] shadow-lg rounded hover:shadow-xl transition-shadow">
            <div className="h-12 w-12 bg-blue-50 rounded-full flex items-center justify-center mb-4 border border-blue-100">
              <BookOpen size={24} className="text-[#0d2a58]" />
            </div>
            <h3 className="font-bold text-xl mb-2 text-[#0d2a58]">Standards</h3>
            <p className="text-sm text-slate-600">Access the vast library of Indian Standards to ensure compliance and quality for your products.</p>
          </div>
          <div className="bg-white p-6 border-t-4 border-orange-500 shadow-lg rounded hover:shadow-xl transition-shadow">
            <div className="h-12 w-12 bg-orange-50 rounded-full flex items-center justify-center mb-4 border border-orange-100">
              <ChevronRight size={24} className="text-orange-600" />
            </div>
            <h3 className="font-bold text-xl mb-2 text-[#0d2a58]">Product Certification</h3>
            <p className="text-sm text-slate-600">Apply for the ISI mark and demonstrate your commitment to quality and safety.</p>
          </div>
          <div className="bg-white p-6 border-t-4 border-emerald-600 shadow-lg rounded hover:shadow-xl transition-shadow">
            <div className="h-12 w-12 bg-emerald-50 rounded-full flex items-center justify-center mb-4 border border-emerald-100">
              <User size={24} className="text-emerald-600" />
            </div>
            <h3 className="font-bold text-xl mb-2 text-[#0d2a58]">Consumer Engagement</h3>
            <p className="text-sm text-slate-600">File complaints, check licenses, and participate in standardization activities.</p>
          </div>
        </div>
      </section>

      {/* Floating Chat Icon */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-8 right-8 h-16 w-16 bg-orange-600 hover:bg-orange-700 text-white rounded-full flex items-center justify-center shadow-2xl z-40 group border-[3px] border-white ring-2 ring-orange-200 transition-colors"
        >
          <MessageSquare size={28} />
          <span className="absolute -top-12 right-0 bg-slate-900 text-white px-3 py-1.5 rounded shadow border border-slate-700 text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Ask BIS Assistant
            <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-slate-900 border-b border-r border-slate-700 transform rotate-45"></div>
          </span>
        </button>
      )}

      {/* Chatbot Overlay Modal */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-2 md:p-6 lg:p-8 backdrop-blur-sm">
          <div className="bg-white w-full h-full max-w-[1400px] rounded-xl shadow-2xl flex flex-col relative border border-slate-300 overflow-hidden">

            {/* Close Button overlayed on top right */}
            <button
              onClick={() => setIsChatOpen(false)}
              className="absolute top-4 right-4 z-50 bg-white/20 hover:bg-white/40 text-white p-2 rounded-full backdrop-blur-md transition-colors border border-white/30"
              title="Close Assistant"
            >
              <X size={20} />
            </button>

            <main className="flex h-full w-full overflow-hidden bg-slate-100">
              {/* Left Panel: Chat Interface */}
              <section className={`${activePdf ? 'w-1/2 border-r border-slate-300 z-20 shadow-xl' : 'w-full'} h-full bg-white flex flex-col relative`}>
                {/* Top Header - Official Govt Style */}
                <header className="flex flex-col shrink-0 z-10 border-b border-slate-300">
                  <div className="bg-[#0d2a58] px-5 py-4 flex items-center justify-between text-white pr-16">
                    <div className="flex items-center gap-3">
                      <div className="bg-white p-2 rounded shadow-sm text-[#0d2a58]">
                        <MessageSquare size={22} strokeWidth={2.5} />
                      </div>
                      <div className="flex flex-col">
                        <h1 className="font-bold text-lg uppercase tracking-wide">
                          BIS Intelligent Assistant
                        </h1>
                        <p className="text-[10px] text-blue-200 uppercase mt-0.5 tracking-widest font-semibold">
                          Knowledge Base Search
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-orange-500 shadow-sm"></div>
                </header>

                <div className="flex-1 overflow-hidden">
                  <ChatPanel onCitationClick={handleCitationClick} />
                </div>
              </section>

              {/* Right Panel: PDF Viewer */}
              {activePdf && (
                <section className="w-1/2 h-full bg-slate-100 relative shadow-inner">
                  <PdfViewerPane
                    standardNo={activePdf}
                    pageNumber={activePage}
                    snippet={activeSnippet}
                    onClose={() => setActivePdf(null)}
                  />
                </section>
              )}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
