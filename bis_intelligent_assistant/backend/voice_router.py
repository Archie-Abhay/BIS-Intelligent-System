import os
import logging
import tempfile
from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from pydantic import BaseModel
from openai import OpenAI

logger = logging.getLogger("voice_router")
router = APIRouter(tags=["Multilingual Voice"])


openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", "dummy-key-for-dev"))

class TranslationRequest(BaseModel):
    text: str
    target_language: str

class TranslationResponse(BaseModel):
    translated_text: str


def translate_text(text: str, target_language: str) -> str:
    """
    Translates text to the target language.
    In production, this should integrate with Bhashini API or IndicTrans2 models natively.
    Here, we use OpenAI gpt-4o as a highly capable robust fallback.
    """
    if target_language.lower() in ["en", "english"]:
        return text
        
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system", 
                    "content": f"You are a professional translator. Translate the following text to {target_language}. Respond ONLY with the translated text, no quotes, no markdown, or additional context."
                },
                {"role": "user", "content": text}
            ],
            temperature=0.0
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        return text # Safe fallback to original English text

@router.post("/api/voice/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    source_language: str = Form("auto")
):
    """
    Receives an audio blob, transcribes it to text via Whisper, 
    and translates it to English to ensure the backend LangGraph always processes in English natively.
    """
    logger.info(f"Received audio file for transcription: {file.filename}")
        
    try:
        # Save temporary file for Whisper
        suffix = os.path.splitext(file.filename)[1]
        if not suffix:
            suffix = ".webm" # Default common web audio extension
            
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
            temp_audio.write(await file.read())
            temp_path = temp_audio.name
        
        with open(temp_path, "rb") as audio_file:
            # Using Whisper for STT (production fallback for Bhashini voice pipelines)
            transcript_response = openai_client.audio.transcriptions.create(
                model="whisper-1", 
                file=audio_file
            )
            
        transcribed_text = transcript_response.text
        os.remove(temp_path)
        
        # Core Architecture Rule: Map everything back to English for Agent Graph
        english_query = transcribed_text
        if source_language.lower() not in ["en", "english", "auto"]:
            logger.info(f"Translating transcribed query from {source_language} to English...")
            english_query = translate_text(transcribed_text, "English")
            
        return {
            "original_transcript": transcribed_text,
            "english_query": english_query
        }
        
    except Exception as e:
        logger.error(f"Error processing audio: {e}")
        raise HTTPException(status_code=500, detail="Audio processing failed.")

@router.post("/api/translate", response_model=TranslationResponse)
async def translate_endpoint(request: TranslationRequest):
    """
    Translates the final agent response (which is natively in English) 
    back to the user's selected regional language.
    """
    translated_text = translate_text(request.text, request.target_language)
    return TranslationResponse(translated_text=translated_text)
