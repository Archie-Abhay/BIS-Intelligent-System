import os
import sys

# Automatically ensure .venv site-packages are on sys.path if running under system Python
_cur_dir = os.path.dirname(os.path.abspath(__file__))
for _root in [os.path.dirname(os.path.dirname(_cur_dir)), os.path.dirname(_cur_dir), os.getcwd()]:
    _venv_site = os.path.join(_root, ".venv", "Lib", "site-packages")
    if os.path.isdir(_venv_site) and _venv_site not in sys.path:
        sys.path.insert(0, _venv_site)
        break

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from backend.graph import app_graph
from backend.voice_router import router as voice_router
from fastapi.staticfiles import StaticFiles
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("fastapi_main")

app = FastAPI(
    title="BIS Intelligent Assistant API",
    description="Production-grade, zero-hallucination agent for BIS standards.",
    version="1.0.0"
)

# Enable CORS so the Next.js frontend can connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001"],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the actual PDFs from the data folder directly using absolute path
_pdf_dir = os.path.join(os.path.dirname(_cur_dir), "data", "pdfs")
os.makedirs(_pdf_dir, exist_ok=True)
app.mount("/pdfs", StaticFiles(directory=_pdf_dir), name="pdfs")

app.include_router(voice_router)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    query: str
    no_hallucination: bool = True
    chat_history: Optional[List[ChatMessage]] = []

class ChatResponse(BaseModel):
    answer: str
    citations: List[Dict[str, Any]]
    suggested_next_steps: List[str]
    intent: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    logger.info(f"Incoming Chat Request: {request.query}")
    try:
        # Initialize LangGraph state
        initial_state = {
            "query": request.query,
            "no_hallucination": request.no_hallucination,
            "chat_history": [msg.dict() for msg in request.chat_history] if request.chat_history else [],
            "validation_attempts": 0,
            "is_valid": False,
            "citations": [],
            "suggested_next_steps": [],
            "retrieved_context": []
        }
        
        # Invoke the LangGraph workflow
        result = app_graph.invoke(initial_state)
        
        # 4. Guardrail Validator Post-Processing
        # If guardrail consistently fails (max retries reached), override answer
        is_valid = result.get("is_valid", False)
        attempts = result.get("validation_attempts", 0)
        
        if not is_valid and attempts >= 3:
            logger.error("Safety Trigger: Generator could not formulate a compliant answer without hallucinating.")
            answer = "I apologize, but I could not formulate a strictly verified answer based on the official documents."
            citations = []
        else:
            answer = result.get("final_answer", "")
            citations = result.get("citations", [])
            
        return ChatResponse(
            answer=answer,
            citations=citations,
            suggested_next_steps=result.get("suggested_next_steps", []),
            intent=result.get("intent"),
            metadata=result.get("extracted_metadata")
        )

    except Exception as e:
        logger.error(f"Error during graph execution: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "BIS Intelligent Assistant API is running successfully!", "status": "ok"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
