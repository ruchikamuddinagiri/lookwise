# Lookwise

Lookwise is a Chrome extension + FastAPI backend that analyzes a selfie using GPT-4o Vision and recommends the best matching makeup shades from any product page on Sephora.

## Features
- AI-powered skin tone & undertone detection  
- Extracts shade names directly from product pages  
- GPT matches user tone with available shades  
- Highlights recommended shades on the website  
- FastAPI backend for analysis

## Project Structure
- `backend/` – FastAPI server (GPT vision + shade matching)  
- `extension/` – Chrome extension (content script + popup)  
- `frontend/` – optional future UI  
