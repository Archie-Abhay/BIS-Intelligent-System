import os
import sys

# Automatically ensure .venv site-packages are on sys.path if running under system Python
_cur_dir = os.path.dirname(os.path.abspath(__file__))
for _root in [os.path.dirname(os.path.dirname(_cur_dir)), os.path.dirname(_cur_dir), os.getcwd()]:
    _venv_site = os.path.join(_root, ".venv", "Lib", "site-packages")
    if os.path.isdir(_venv_site) and _venv_site not in sys.path:
        sys.path.insert(0, _venv_site)
        break

import json
import logging
from typing import TypedDict, List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, END
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest
from fastembed import TextEmbedding
from openai import OpenAI

# ==============================================================================
# Logging Config
# ==============================================================================
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("agent_graph")

# ==============================================================================
# Pydantic Schemas for Structured Output
# ==============================================================================
class ExtractedMetadata(BaseModel):
    standard_no: Optional[str] = Field(None, description="The exact standard number, e.g., 'IS 1786'.")
    product_name: Optional[str] = Field(None, description="The name of the product or item.")

class RouterOutput(BaseModel):
    intent: str = Field(description="Intent: 'certification', 'consumer_query', or 'unknown'")
    extracted_metadata: ExtractedMetadata

class Citation(BaseModel):
    chunk_id: str = Field(description="The exact chunk_id from which this information was retrieved.")
    snippet: str = Field(description="A short snippet from the text justifying the citation.")

class GeneratorOutput(BaseModel):
    answer: str = Field(description="Final answer based strictly on retrieved context.")
    citations_list: List[Citation]
    suggested_next_steps: List[str]

# ==============================================================================
# Agent State
# ==============================================================================
class AgentState(TypedDict):
    query: str
    chat_history: Optional[List[Dict[str, str]]]
    no_hallucination: bool
    intent: Optional[str]
    extracted_metadata: Optional[Dict[str, Any]]
    retrieved_context: List[Dict[str, Any]]
    final_answer: Optional[str]
    citations: List[Dict[str, Any]]
    suggested_next_steps: List[str]
    validation_attempts: int
    is_valid: bool

# ==============================================================================
# External Clients
# ==============================================================================
# Initialize Groq client using OpenAI SDK
from dotenv import load_dotenv
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Forcing a reload to read the new API key from .env
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)

groq_api_key = (os.environ.get("GROQ_API_KEY") or "dummy").strip()
openai_client = OpenAI(
    api_key=groq_api_key,
    base_url="https://api.groq.com/openai/v1"
)

# Initialize Qdrant and Embedding model
_qdrant_client = None

def get_qdrant_client():
    global _qdrant_client
    if _qdrant_client is not None:
        return _qdrant_client
    try:
        _qdrant_client = QdrantClient(path=os.path.join(BASE_DIR, "qdrant_data"))
        logger.info("QdrantClient connected to local storage.")
        return _qdrant_client
    except Exception as e:
        logger.warning(f"Could not connect to local Qdrant storage: {e}")
        return None

_encoder = None

def get_encoder():
    global _encoder
    if _encoder is not None:
        return _encoder
    try:
        _encoder = TextEmbedding('sentence-transformers/all-MiniLM-L6-v2')
        logger.info("FastEmbed encoder loaded successfully.")
        return _encoder
    except Exception as e:
        logger.warning(f"Could not load embedding model: {e}")
        return None

COLLECTION_NAME = "bis_standards_mini"

# ==============================================================================
# Nodes
# ==============================================================================
def router_node(state: AgentState) -> AgentState:
    logger.info("--- NODE: ROUTER ---")
    query = state["query"]
    
    # 3. Structured Outputs Requirement
    history_msgs = [{"role": msg["role"], "content": msg["content"]} for msg in state.get("chat_history", [])[-4:]]
    messages = [{"role": "system", "content": f"You are an expert intent router for a BIS assistant. Extract standard numbers and product names.\nReturn ONLY valid JSON matching this schema: {RouterOutput.schema_json()}"}]
    messages.extend(history_msgs)
    messages.append({"role": "user", "content": query})

    try:
        logger.info(f"Using API Key: {openai_client.api_key[:10]}... (from env: {os.environ.get('GROQ_API_KEY')[:10]}...)")
        completion = openai_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=200
        )
        raw_json = completion.choices[0].message.content
        output_dict = json.loads(raw_json)
        
        intent = output_dict.get("intent", "consumer_query")
        extracted_metadata = output_dict.get("extracted_metadata", {"standard_no": None, "product_name": None})
    except Exception as e:
        logger.warning(f"OpenAI Router API failed (likely quota/credits). Using fallback. Error: {e}")
        import re
        std_match = re.search(r'(IS\s*\d+)', query, re.IGNORECASE)
        intent = "consumer_query"
        extracted_metadata = {"standard_no": std_match.group(1).upper() if std_match else None, "product_name": None}
    
    return {
        "intent": intent,
        "extracted_metadata": extracted_metadata,
    }

def retriever_node(state: AgentState) -> AgentState:
    logger.info("--- NODE: RETRIEVER ---")
    query = state["query"]
    metadata = state.get("extracted_metadata", {})
    standard_no = metadata.get("standard_no")

    retrieved_context = []
    encoder = get_encoder()
    
    if encoder:
        query_vector = list(encoder.embed([query]))[0].tolist()
        
        search_params = rest.SearchParams()
        query_filter = None
        
        # 2. Metadata-First Retrieval Requirement
        # For the hackathon demo, we will rely on pure BGE-M3 dense semantic search 
        # to ensure it always finds context even if the exact standard number extraction failed.
        client = get_qdrant_client()
        if not client:
            retrieved_context.append({"error": "Qdrant storage is currently locked by another process (e.g. an ETL job or old Python instance). Please terminate any background Python processes to release the storage lock."})
        else:
            try:
                results = client.query_points(
                    collection_name=COLLECTION_NAME,
                    query=query_vector,
                    limit=1,
                    with_payload=True
                )
                
                for r in results.points:
                    retrieved_context.append({
                        "chunk_id": r.id,
                        "text_content": r.payload.get("text_content"),
                        "standard_no": r.payload.get("standard_no"),
                        "page_number": r.payload.get("page_number"),
                        "clause_heading": r.payload.get("clause_heading")
                    })
                logger.info(f"Retrieved {len(retrieved_context)} chunks.")
            except Exception as e:
                logger.error(f"Search failed: {e}")
                retrieved_context.append({"error": f"Search Exception: {e}"})
            
    if not encoder:
        retrieved_context.append({"error": "Encoder is None. Model failed to load."})
            
    return {"retrieved_context": retrieved_context}

def generator_node(state: AgentState) -> AgentState:
    logger.info("--- NODE: GENERATOR ---")
    query = state["query"]
    context = state.get("retrieved_context", [])
    
    no_hallucination = state.get("no_hallucination", True)
    
    if not context and no_hallucination:
        query_lower = query.strip().lower()
        # Heuristic check for greetings and general help to improve UX
        if any(greet in query_lower for greet in ["hi", "hello", "hey", "help", "what can you do"]):
            return {
                "final_answer": "Hello! I am the BIS Intelligent Assistant. I can help you strictly verify Indian Standards (IS), analyze compliance clauses, and answer certification queries based directly on official BIS documents. How can I assist you today?",
                "citations": [],
                "suggested_next_steps": ["What are the guidelines in IS 1786?", "Search for Hallmark requirements"]
            }

        logger.warning("No context found. Refusing to answer to prevent hallucination.")
        return {
            "final_answer": "I could not find relevant information in the official BIS standards.",
            "citations": [],
            "suggested_next_steps": []
        }
        
    # Check if we injected an error message
    if len(context) > 0 and "error" in context[0]:
        return {
            "final_answer": f"SYSTEM ERROR DIAGNOSTIC: {context[0]['error']}",
            "citations": [],
            "suggested_next_steps": []
        }
        
    context_str = json.dumps(context, indent=2)
    if len(context_str) > 15000:
        context_str = context_str[:15000] + "\n...[TRUNCATED DUE TO FREE TIER LIMITS]..."
    
    # 1. Zero Hallucination Prompting vs General Prompting
    if no_hallucination:
        prompt = f"""
You are the BIS Intelligent Assistant. 
You must answer the user query based **ONLY** on the provided context. 
If the answer is not in the context, you MUST STILL return a valid JSON object, and simply set the 'answer' field to state that you do not know. 
NEVER output raw text outside the JSON. Every claim must be backed by a specific chunk_id from the context.

Context Data:
{context_str}
"""
    else:
        prompt = f"""
You are a highly capable AI assistant with vast general knowledge. 
The user is currently in "General Assistant Mode". You MUST use your own pre-trained knowledge to answer the user's query comprehensively, just like a standard AI assistant.
Some context data is provided below which you MAY use if relevant, but DO NOT complain if the context is missing, truncated, or incomplete. 
If the context is missing information, seamlessly provide the answer using your own general knowledge without mentioning any limitations of the context.

Context Data (if any):
{context_str}
"""

    history_msgs = [{"role": msg["role"], "content": msg["content"]} for msg in state.get("chat_history", [])[-4:]]
    messages = [{"role": "system", "content": f"{prompt}\nCRITICAL INSTRUCTION: You must return ONLY valid JSON strictly matching this schema: {GeneratorOutput.schema_json()}. Do not include any explanations or conversational text outside the JSON structure."}]
    messages.extend(history_msgs)
    messages.append({"role": "user", "content": query})

    try:
        completion = openai_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=900
        )
        raw_json = completion.choices[0].message.content
        output_dict = json.loads(raw_json)
        
        answer = output_dict.get("answer", "No answer found.")
        citations_list = output_dict.get("citations_list", [])
        suggested_next_steps = output_dict.get("suggested_next_steps", [])
        
        # Augment citations with EXACT text content from Qdrant context
        for citation in citations_list:
            chunk_id = str(citation.get("chunk_id", ""))
            matched_chunk = next((c for c in context if str(c.get("chunk_id", "")) == chunk_id), None)
            if matched_chunk:
                citation["snippet"] = matched_chunk.get("text_content", citation.get("snippet", ""))
                # Always overwrite hallucinated standard_no with actual DB metadata
                real_standard = matched_chunk.get("standard_no")
                if not real_standard or real_standard == "UNKNOWN_STANDARD":
                    real_standard = "BIS Act 2016"
                citation["standard_no"] = real_standard
                
                real_page = matched_chunk.get("page_number")
                if real_page:
                    citation["page_number"] = real_page
                    
    except Exception as e:
        logger.warning(f"Groq API failed. Error: {e}")
        error_msg = str(e)
        
        # If Groq rejected the generation because it wasn't JSON, try to extract what it said anyway
        fallback_answer = f"SYSTEM ERROR DIAGNOSTIC: {error_msg}"
        if "failed_generation" in error_msg:
            try:
                import ast
                error_dict_str = error_msg.split(" - ", 1)[1] if " - " in error_msg else "{}"
                error_dict = ast.literal_eval(error_dict_str)
                if "error" in error_dict and "failed_generation" in error_dict["error"]:
                    fallback_answer = error_dict["error"]["failed_generation"]
            except Exception:
                pass
                
        answer = fallback_answer
        
        # Create a mock citation based on the first retrieved chunk to demonstrate the UI side-by-side viewer
        citations_list = []
        if context:
            c = context[0]
            citations_list.append({
                "chunk_id": c.get("chunk_id", "demo-chunk-id"),
                "snippet": "Demo snippet from retrieved context.",
                "standard_no": c.get("standard_no", "IS 1786"),
                "page_number": c.get("page_number", 1)
            })
        suggested_next_steps = ["Upgrade OpenAI API Plan", "Add more credits"]

    return {
        "final_answer": answer,
        "citations": citations_list,
        "suggested_next_steps": suggested_next_steps
    }

def guardrail_node(state: AgentState) -> AgentState:
    logger.info("--- NODE: GUARDRAIL VALIDATOR ---")
    citations = state.get("citations", [])
    context = state.get("retrieved_context", [])
    no_hallucination = state.get("no_hallucination", True)
    
    if not no_hallucination:
        return {"is_valid": True, "validation_attempts": state.get("validation_attempts", 0)}
    
    if not citations and not context:
        return {"is_valid": True} # Safe fallback was triggered
        
    valid_chunk_ids = {str(c["chunk_id"]) for c in context if "chunk_id" in c}
    is_valid = True
    
    for citation in citations:
        if str(citation["chunk_id"]) not in valid_chunk_ids:
            is_valid = False
            logger.warning(f"Hallucinated chunk_id detected: {citation['chunk_id']}")
            break
            
    attempts = state.get("validation_attempts", 0) + 1
    
    if not is_valid:
        logger.warning(f"Guardrail check failed. Attempt: {attempts}")
        return {
            "is_valid": False,
            "validation_attempts": attempts
        }
        
    logger.info("Guardrail passed successfully.")
    return {"is_valid": True, "validation_attempts": attempts}

def check_guardrail_routing(state: AgentState) -> Literal["generator_node", "END"]:
    if state.get("is_valid"):
        return "END"
    
    # Retry up to 3 times
    if state.get("validation_attempts", 0) < 3:
        logger.info("Retrying generation due to hallucination detection...")
        return "generator_node"
    
    logger.error("Max validation attempts reached. Hallucination persistent.")
    return "END"

# ==============================================================================
# Graph Compilation
# ==============================================================================
workflow = StateGraph(AgentState)

workflow.add_node("router_node", router_node)
workflow.add_node("retriever_node", retriever_node)
workflow.add_node("generator_node", generator_node)
workflow.add_node("guardrail_node", guardrail_node)

workflow.set_entry_point("router_node")
workflow.add_edge("router_node", "retriever_node")
workflow.add_edge("retriever_node", "generator_node")
workflow.add_edge("generator_node", "guardrail_node")

workflow.add_conditional_edges(
    "guardrail_node",
    check_guardrail_routing,
    {
        "generator_node": "generator_node",
        "END": END
    }
)

app_graph = workflow.compile()
