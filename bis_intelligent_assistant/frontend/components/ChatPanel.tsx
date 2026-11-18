import { useState, useRef, useEffect } from "react";
import { Send, FileText, AlertCircle, Loader2, Mic, Sparkles, PlusCircle, History } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Citation {
  chunk_id: string;
  snippet?: string;
  standard_no?: string;
  page_number?: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  suggestedNextSteps?: string[];
}

const TypewriterText = ({ text }: { text: string }) => {
  const [displayedText, setDisplayedText] = useState("");
  
  useEffect(() => {
    if (!text) {
      setDisplayedText("");
      return;
    }
    // Dynamic chunking: ensures any answer finishes streaming within ~1 second
    const chunkSize = Math.max(5, Math.ceil(text.length / 50));
    let i = chunkSize;
    setDisplayedText(text.slice(0, chunkSize));

    const interval = setInterval(() => {
      if (i < text.length) {
        i = Math.min(i + chunkSize, text.length);
        setDisplayedText(text.slice(0, i));
      } else {
        clearInterval(interval);
      }
    }, 15);
    return () => clearInterval(interval);
  }, [text]);
  
  return (
    <div className="prose prose-sm max-w-none prose-slate prose-p:leading-relaxed prose-pre:bg-slate-100 prose-pre:text-slate-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {displayedText}
      </ReactMarkdown>
    </div>
  );
};

export default function ChatPanel({ onCitationClick }: { onCitationClick: (std: string, page: number, snippet?: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I am the highly-secured BIS Assistant. How can I help you regarding Indian Standards today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [noHallucinationMode, setNoHallucinationMode] = useState(false);
  const [loadingText, setLoadingText] = useState("Analyzing request...");
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [savedChats, setSavedChats] = useState<Message[][]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingText]);

  useEffect(() => {
    const stored = localStorage.getItem("bis_chat_history");
    if (stored) {
      try {
        setSavedChats(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse chat history");
      }
    }
  }, []);

  useEffect(() => {
    if (!loading) return;
    const steps = [
      "Searching BIS Knowledge Base...",
      "Extracting contextual vectors...",
      "Validating structural contexts...",
      "Generating verified response..."
    ];
    let i = 0;
    setLoadingText(steps[0]);
    const interval = setInterval(() => {
      i = (i + 1) % steps.length;
      setLoadingText(steps[i]);
    }, 1200);
    return () => clearInterval(interval);
  }, [loading]);

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? " " : "") + transcript);
    };
    recognition.start();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userQuery = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userQuery }]);
    setLoading(true);

    try {
      const historyPayload = messages.map(m => ({ role: m.role, content: m.content }));
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

      const res = await fetch(`${backendUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          query: userQuery, 
          no_hallucination: noHallucinationMode,
          chat_history: historyPayload
        })
      });

      if (!res.ok) {
        let errorDetail = `Server error (${res.status})`;
        try {
          const errData = await res.json();
          if (errData && errData.detail) {
            errorDetail = typeof errData.detail === "string" ? errData.detail : JSON.stringify(errData.detail);
          }
        } catch (_) {}
        throw new Error(errorDetail);
      }
      const data = await res.json();
      
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: data.answer,
        citations: data.citations,
        suggestedNextSteps: data.suggested_next_steps
      }]);
    } catch (error: any) {
      console.error(error);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
      const isConnectionError = error?.name === "TypeError" || (error?.message && error.message.includes("fetch"));
      const displayMessage = isConnectionError
        ? `Sorry, I encountered an error connecting to the backend verification server at ${backendUrl}. Please ensure the backend server is running.`
        : `Backend Error: ${error?.message || "Unknown error occurred"}`;
      setMessages(prev => [...prev, { role: "assistant", content: displayMessage }]);
    } finally {
      setLoading(false);
    }
  };

  const quickStarts = [
    "Which Indian Standard is applicable for drinking water?",
    "How can a consumer file a complaint with BIS?",
    "Explain the process of getting an ISI mark for my product.",
    "हॉलमार्किंग (Hallmarking) क्या है और यह क्यों जरूरी है?"
  ];

  const handleNewChat = () => {
    if (messages.length > 1) {
      const updated = [messages, ...savedChats].slice(0, 3);
      setSavedChats(updated);
      localStorage.setItem("bis_chat_history", JSON.stringify(updated));
    }
    setMessages([{ role: "assistant", content: "Hello! I am the highly-secured BIS Assistant. How can I help you regarding Indian Standards today?" }]);
    setInput("");
  };

  const loadChat = (chat: Message[]) => {
    if (messages.length > 1 && !savedChats.includes(messages)) {
      const updated = [messages, ...savedChats].slice(0, 3);
      setSavedChats(updated);
      localStorage.setItem("bis_chat_history", JSON.stringify(updated));
    }
    setMessages(chat);
    setShowHistory(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Floating Action Buttons */}
      <div className="absolute top-4 right-6 z-20 flex gap-2">
        {savedChats.length > 0 && (
          <div className="relative">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-600 text-[10px] uppercase font-bold rounded shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all"
            >
              <History size={14} strokeWidth={2.5} />
              Recent
            </button>
            {showHistory && (
              <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-slate-200 rounded shadow-lg overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Last 3 Conversations
                </div>
                {savedChats.map((chat, idx) => {
                  const titleMsg = chat.find(m => m.role === 'user')?.content || "Empty Chat";
                  const title = titleMsg.length > 35 ? titleMsg.substring(0, 35) + "..." : titleMsg;
                  return (
                    <button 
                      key={idx}
                      onClick={() => loadChat(chat)}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-bis-50 hover:text-bis-700 transition-colors border-b border-slate-50 last:border-0"
                    >
                      {title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        
        {messages.length > 1 && (
          <button 
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-bis-600 text-[10px] uppercase font-bold rounded shadow-sm hover:bg-bis-50 hover:border-bis-600 transition-all"
            title="Save current and start new conversation"
          >
            <PlusCircle size={14} strokeWidth={2.5} />
            New Chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 pt-14">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded border p-4 shadow-sm ${
              msg.role === 'user' 
                ? 'bg-bis-600 text-white rounded-br-none border-bis-900 shadow-md' 
                : 'bg-white border-slate-300 text-slate-800 rounded-bl-none'
            }`}>
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              ) : (
                <TypewriterText text={msg.content} />
              )}
              
              {/* Display citations if present */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
                  <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5 tracking-wide uppercase">
                    <FileText size={12} /> Verified References
                  </span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {msg.citations.filter((c, index, self) => 
                      index === self.findIndex((t) => (
                        (t.standard_no || "BIS Act 2016") === (c.standard_no || "BIS Act 2016") && 
                        (t.page_number || 1) === (c.page_number || 1)
                      ))
                    ).map((c, idx) => {
                      const std = c.standard_no || "BIS Act 2016"; 
                      const pg = c.page_number || 1;
                      return (
                        <button
                          key={idx}
                          onClick={() => onCitationClick(std, pg, c.snippet)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-bold text-bis-900 hover:border-bis-500 hover:text-bis-600 hover:bg-white transition-all cursor-pointer shadow-sm group"
                          title={c.snippet ? `Exact Match:\n"${c.snippet}"` : `Chunk ID: ${c.chunk_id}`}
                        >
                          <AlertCircle size={14} strokeWidth={2} className="text-bis-500 group-hover:scale-110 transition-transform" />
                          {std} (Page {pg})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Display follow-up questions if present */}
              {msg.suggestedNextSteps && msg.suggestedNextSteps.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 tracking-wider uppercase">
                    <Sparkles size={12} className="text-bis-500" /> Suggested Follow-ups
                  </span>
                  <div className="flex flex-col gap-2 mt-1">
                    {msg.suggestedNextSteps.map((qs, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setInput(qs);
                          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="text-left text-xs font-medium px-3 py-2 bg-slate-50 border border-slate-200 rounded text-bis-900 hover:border-bis-500 hover:text-bis-600 hover:bg-white transition-all cursor-pointer shadow-sm"
                      >
                        {qs}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none p-4 px-5 flex items-center gap-3 shadow-sm">
              <Loader2 size={18} className="text-bis-600 animate-spin" />
              <span className="text-sm text-slate-500 font-medium tracking-wide">
                {loadingText}
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-200 shrink-0">
        
        {messages.length === 1 && (
          <div className="max-w-4xl mx-auto mb-4 flex flex-wrap justify-center gap-2">
            {quickStarts.map((qs, i) => (
              <button 
                key={i}
                onClick={() => setInput(qs)}
                className="text-xs font-bold bg-white border border-slate-300 text-bis-900 px-3 py-2 rounded hover:border-bis-500 hover:text-bis-600 hover:shadow-sm transition-all flex items-center gap-2 shadow-sm"
              >
                <Sparkles size={12} className="text-bis-500" />
                {qs}
              </button>
            ))}
          </div>
        )}

        <div className="max-w-4xl mx-auto mb-3 flex items-center justify-end">
          <label className="flex items-center gap-2 cursor-pointer" onClick={() => setNoHallucinationMode(!noHallucinationMode)}>
            <span className="text-xs font-semibold tracking-wide text-slate-500">
              {noHallucinationMode ? "Strict Compliance Mode (No Hallucination)" : "General Assistant Mode"}
            </span>
            <div 
              className={`relative w-10 h-5 rounded-full transition-colors ${noHallucinationMode ? 'bg-bis-600' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${noHallucinationMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </label>
        </div>
        
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto">
          <button 
            type="button" 
            onClick={handleVoiceInput}
            className={`p-3.5 transition-colors rounded-xl border flex-shrink-0 ${
              isListening ? 'bg-red-50 border-red-200 text-red-500 animate-pulse' : 'text-slate-400 hover:text-bis-600 bg-slate-50 hover:bg-bis-50 border-slate-200'
            }`}
            title="Use Voice Input"
          >
             <Mic size={20} />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search Bureau of Indian Standards Knowledge Base..."
            className="flex-1 p-3 px-4 bg-white border border-slate-300 rounded text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-bis-600 focus:border-bis-600 transition-none placeholder:text-slate-400 font-medium"
            disabled={loading}
          />
          <button 
            type="submit" 
            disabled={loading || !input.trim()}
            className="px-6 bg-bis-600 text-white rounded shadow-sm border border-bis-900 hover:bg-bis-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center shrink-0 uppercase text-xs font-bold tracking-wider"
          >
            SEND
          </button>
        </form>
      </div>
    </div>
  );
}
