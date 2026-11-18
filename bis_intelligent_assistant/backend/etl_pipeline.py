import os
import re
import uuid
import logging
import fitz  # PyMuPDF
from typing import List, Optional, Generator
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient
# pyrefly: ignore [missing-import]
from qdrant_client.http import models as rest
from fastembed import TextEmbedding

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("etl_pipeline")

# ==============================================================================
# Models
# ==============================================================================

class BISChunk(BaseModel):
    """Pydantic schema for structured output and validation of chunks."""
    chunk_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    doc_type: Optional[str] = Field(default="Product_Manual")
    is_number: Optional[str] = None
    scheme: Optional[str] = None
    mandatory: bool = True
    applicable_industry: Optional[str] = Field(default="Manufacturing")
    clause_reference: Optional[str] = None
    
    # We keep standard_no mapped alongside is_number to prevent breaking the existing graph router
    standard_no: Optional[str] = None
    clause_heading: Optional[str] = None
    text_content: str
    page_number: int

# ==============================================================================
# Extractor Logic
# ==============================================================================

class BISDocumentProcessor:
    def __init__(self, pdf_dir: str):
        self.pdf_dir = pdf_dir
        # Regex patterns for semantic chunking
        self.clause_pattern = re.compile(r'^(Clause\s+\d+(\.\d+)*)', re.IGNORECASE)
        self.standard_pattern = re.compile(r'^(IS\s+\d+(:?\d+)*)', re.IGNORECASE)

    def extract_and_chunk(self) -> Generator[BISChunk, None, None]:
        """Reads PDFs from directory and chunks them by semantic boundaries."""
        if not os.path.exists(self.pdf_dir):
            logger.warning(f"Directory {self.pdf_dir} does not exist. Creating it.")
            os.makedirs(self.pdf_dir)
            
        pdf_files = [f for f in os.listdir(self.pdf_dir) if f.lower().endswith('.pdf')]
        logger.info(f"Found {len(pdf_files)} PDF(s) for processing.")

        for pdf_file in pdf_files:
            file_path = os.path.join(self.pdf_dir, pdf_file)
            logger.info(f"Processing document: {pdf_file}")
            yield from self._process_single_pdf(file_path)

    def _process_single_pdf(self, file_path: str) -> Generator[BISChunk, None, None]:
        try:
            doc = fitz.open(file_path)
        except Exception as e:
            logger.error(f"Failed to open PDF {file_path}: {e}")
            return

        current_standard = "UNKNOWN_STANDARD"
        current_clause = "Introduction"
        current_text_buffer = []
        current_page = 1

        for page_num in range(len(doc)):
            page = doc[page_num]
            blocks = page.get_text("dict")["blocks"]

            for block in blocks:
                if "lines" not in block:
                    continue
                
                for line in block["lines"]:
                    for span in line["spans"]:
                        text = span["text"].strip()
                        if not text:
                            continue

                        # Check if it's bold text
                        is_bold = "bold" in span["font"].lower()

                        # Detect Standard Number
                        standard_match = self.standard_pattern.match(text)
                        if standard_match:
                            current_standard = standard_match.group(1)
                            logger.debug(f"Detected Standard: {current_standard}")

                        # Detect Clause Boundary (Layout-aware)
                        clause_match = self.clause_pattern.match(text)
                        if clause_match and is_bold:
                            # Yield previous chunk if exists
                            if current_text_buffer:
                                yield BISChunk(
                                    doc_type="Product_Manual", # Heuristic/Static
                                    is_number=current_standard,
                                    scheme=self._infer_scheme(current_text_buffer),
                                    mandatory=True,
                                    applicable_industry="Electronics", # Configurable
                                    clause_reference=current_clause,
                                    standard_no=current_standard,
                                    clause_heading=current_clause,
                                    text_content=" ".join(current_text_buffer),
                                    page_number=current_page
                                )
                                current_text_buffer = []
                            
                            current_clause = clause_match.group(1)
                            current_page = page_num + 1

                        current_text_buffer.append(text)

        # Yield any remaining text
        if current_text_buffer:
            yield BISChunk(
                doc_type="Product_Manual",
                is_number=current_standard,
                scheme=self._infer_scheme(current_text_buffer),
                mandatory=True,
                applicable_industry="Electronics",
                clause_reference=current_clause,
                standard_no=current_standard,
                clause_heading=current_clause,
                text_content=" ".join(current_text_buffer),
                page_number=current_page
            )

    def _infer_scheme(self, text_buffer: List[str]) -> str:
        """Heuristic to infer scheme type (e.g., ISI, CRS, Hallmark) from text."""
        full_text = " ".join(text_buffer).lower()
        if "compulsory registration" in full_text or "crs" in full_text:
            return "CRS"
        if "hallmark" in full_text:
            return "Hallmark"
        return "ISI"

# ==============================================================================
# Qdrant ETL
# ==============================================================================

class QdrantIngester:
    def __init__(self, collection_name: str = "bis_standards_mini"):
        self.collection_name = collection_name
        # Local Qdrant directory
        self.client = QdrantClient(path="../qdrant_data") 
        logger.info("Loading Mini AI model (optimized for Celeron)...")
        self.encoder = TextEmbedding('sentence-transformers/all-MiniLM-L6-v2')
        
        self._ensure_collection()

    def _ensure_collection(self):
        """Creates collection with Hybrid Search config if it doesn't exist."""
        if not self.client.collection_exists(self.collection_name):
            logger.info(f"Creating collection '{self.collection_name}' in Qdrant.")
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=rest.VectorParams(
                    size=384, # MiniLM dim
                    distance=rest.Distance.COSINE
                ),
                sparse_vectors_config={
                    "bm25": rest.SparseVectorParams(modifier=rest.Modifier.IDF)
                }
            )
            # Create payload index for metadata-first retrieval
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="standard_no",
                field_schema=rest.PayloadSchemaType.KEYWORD,
            )

    def ingest_chunks(self, chunks: Generator[BISChunk, None, None]):
        """Embeds and uploads chunks to Qdrant."""
        chunk_list = list(chunks)
        if not chunk_list:
            logger.warning("No chunks to ingest.")
            return

        logger.info(f"Preparing to ingest {len(chunk_list)} chunks.")
        
        texts = [chunk.text_content for chunk in chunk_list]
        logger.info("Generating dense embeddings with BGE-M3...")
        dense_embeddings = list(self.encoder.embed(texts))

        points = []
        for i, chunk in enumerate(chunk_list):
            points.append(
                rest.PointStruct(
                    id=chunk.chunk_id,
                    vector={
                        "": dense_embeddings[i].tolist(), 
                        # Note: BM25 sparse vectors would be inserted here via SPLADE or Qdrant FastEmbed setup
                    },
                    payload={
                        "doc_type": chunk.doc_type,
                        "is_number": chunk.is_number,
                        "scheme": chunk.scheme,
                        "mandatory": chunk.mandatory,
                        "applicable_industry": chunk.applicable_industry,
                        "clause_reference": chunk.clause_reference,
                        "standard_no": chunk.standard_no,
                        "clause_heading": chunk.clause_heading,
                        "text_content": chunk.text_content,
                        "page_number": chunk.page_number
                    }
                )
            )

        logger.info("Uploading points to Qdrant...")
        self.client.upsert(
            collection_name=self.collection_name,
            points=points
        )
        logger.info("Ingestion complete.")

if __name__ == "__main__":
    PDF_DIRECTORY = "../data/pdfs"
    os.makedirs(PDF_DIRECTORY, exist_ok=True)
    
    logger.info(f"Please place PDF files in '{PDF_DIRECTORY}' and run this script.")
    processor = BISDocumentProcessor(PDF_DIRECTORY)
    chunks_gen = processor.extract_and_chunk()
    
    ingester = QdrantIngester()
    ingester.ingest_chunks(chunks_gen)




# TO RUN BACKEND:
# Option 1 (From workspace root "BIS CB"):
#   python -m uvicorn backend.main:app --reload --port 8000 --app-dir bis_intelligent_assistant
#
# Option 2 (From bis_intelligent_assistant directory):
#   cd "bis_intelligent_assistant"
#   python -m uvicorn backend.main:app --reload --port 8000
#
# FOR FRONTEND:
#   cd "bis_intelligent_assistant\frontend"
#   npm run dev
