import { X, ExternalLink, Search } from "lucide-react";

interface PdfViewerPaneProps {
  standardNo: string;
  pageNumber: number | null;
  snippet?: string | null;
  onClose: () => void;
}

export default function PdfViewerPane({ standardNo, pageNumber, snippet, onClose }: PdfViewerPaneProps) {
  let fileName = "";
  if (standardNo.includes("BIS") || standardNo.includes("Act") || standardNo.includes("2016")) {
    fileName = "BIS-Act-2016.pdf";
  } else if (standardNo.includes("2993")) {
    fileName = "Revised_Product_Manuals_for_IS_2993_(Part_1)_and_IS_2993_(Part_2)_69BG_2025-05-07.pdf";
  }
  
  // Construct hash params for page and search highlighting
  let hashParams = [];
  if (pageNumber) hashParams.push(`page=${pageNumber}`);
  if (snippet) {
    // Chrome iframe search is flaky with phrases. Instead, find the single longest word in the snippet.
    const cleanSnippet = snippet.replace(/[^\w\s]/gi, ' ');
    const words = cleanSnippet.split(/\s+/).filter(w => w.length > 4);
    if (words.length > 0) {
      // Find longest word
      const longestWord = words.reduce((a, b) => a.length > b.length ? a : b);
      hashParams.push(`search=${encodeURIComponent(longestWord)}`);
    }
  }
  const hash = hashParams.length > 0 ? `#${hashParams.join('&')}` : '';
  
  // Point directly to the backend's static file server
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  const pdfUrl = `${backendUrl}/pdfs/${fileName}${hash}`;

  return (
    <div className="flex flex-col h-full bg-slate-200">
      <div className="h-14 bg-slate-800 text-white flex items-center justify-between px-5 shadow-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold tracking-wide">
            Source Document: <span className="text-bis-500">{standardNo}</span>
          </h2>
          {pageNumber && (
            <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded-full font-medium">
              Page {pageNumber}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a 
            href={pdfUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={18} />
          </a>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      
      {/* Extracted Text Snippet Overlay */}
      {snippet && fileName && (
        <div className="bg-yellow-50 border-b border-yellow-200 p-4 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2 mb-1.5">
             <Search size={14} className="text-yellow-600" />
             <h3 className="text-xs font-bold text-yellow-700 uppercase tracking-wide">Extracted Source Text</h3>
          </div>
          <div className="text-sm text-yellow-900 leading-relaxed italic bg-yellow-100/50 p-2.5 rounded-md border border-yellow-200/50 max-h-32 overflow-y-auto">
            <mark className="bg-yellow-200 text-yellow-900 px-1 rounded">{snippet}</mark>
          </div>
        </div>
      )}

      <div className="flex-1 w-full bg-slate-300 overflow-hidden relative">
        {fileName ? (
          <iframe 
            key={pdfUrl}
            src={pdfUrl} 
            className="absolute inset-0 w-full h-full border-none"
            title={`PDF Viewer - ${standardNo}`}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-white">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100 shadow-sm">
              <ExternalLink size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Document Not Available</h3>
            <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
              The document <strong className="text-slate-700">{standardNo}</strong> is not available in the current demo database. The system only has access to <strong>BIS Act 2016</strong> and <strong>IS 2993</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
