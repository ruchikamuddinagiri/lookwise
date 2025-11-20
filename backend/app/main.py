import os
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles
from typing import List, Optional, Dict
from PIL import Image
import io
import random
import json
from openai import OpenAI
import base64


from .llm import plan_steps
from .video import make_clip
from .tts import speak
from .compose import merge
from .brandProducts import BRAND_PRODUCTS

class Product(BaseModel):
    id: str
    name: str
    shade_name: str
    hex: str
    tone: str
    undertone: str
    category: str
    coverage: str | None = None


class AnalyzeResponse(BaseModel):
    skin_tone: str
    undertone: str
    products: List[Product]


load_dotenv()
print("🔑 Loaded API key prefix:", os.getenv("OPENAI_API_KEY")[:10])

app = FastAPI(title="LookWise AI Backend")
client = OpenAI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    prompt: str

def mock_detect_skin_attributes(img_bytes: bytes) -> tuple[str, str]:
    """
    v0 stub for skin tone + undertone detection.
    Replace with real model later.
    For stable demos, you can just:
        return "medium", "warm"
    """
    possible_tones = ["light", "light-medium", "medium", "tan", "deep"]
    possible_undertones = ["cool", "warm", "neutral", "olive"]

    tone = random.choice(possible_tones)
    undertone = random.choice(possible_undertones)
    return tone, undertone


def filter_products_by_tone(
    tone: str, undertone: str, max_results: int = 5
) -> List[Product]:
    matched = []

    for p in BRAND_PRODUCTS:
        if p["tone"] == tone and p["undertone"] == undertone:
            matched.append(p)

    # Relax if no perfect match
    if not matched:
        matched = [p for p in BRAND_PRODUCTS if p["tone"] == tone]

    if not matched:
        matched = BRAND_PRODUCTS

    matched = matched[:max_results]
    return [Product(**p) for p in matched]

def build_products_from_page_shades(
    page_shades: List[Dict],
    selected_names: List[str],
    skin_tone: str,
    undertone: str,
    max_results: int = 3,
    default_category: str = "shade",
) -> List[Product]:
    """
    Build Product objects for the shades GPT selected.
    If selected_names is empty, fall back to first few page_shades.
    """

    # index by shadeName for easy lookup
    by_name = {s.get("shadeName"): s for s in page_shades if s.get("shadeName")}

    chosen: List[Dict] = []

    # 1) prefer explicit GPT picks
    for name in selected_names:
        shade = by_name.get(name)
        if shade:
            chosen.append(shade)

    # 2) if GPT picks are missing or too few, pad with first shades on the page
    if len(chosen) < max_results:
        for s in page_shades:
            if s not in chosen:
                chosen.append(s)
            if len(chosen) >= max_results:
                break

    products: List[Product] = []
    for s in chosen[:max_results]:
        shade_name = s.get("shadeName", "Unknown")
        sku = s.get("sku") or shade_name

        products.append(
            Product(
                id=str(sku),
                name=shade_name,          # display name
                shade_name=shade_name,    # used by extension to highlight
                hex="#cccccc",            # placeholder swatch color for now
                tone=skin_tone,
                undertone=undertone,
                category=default_category,
            )
        )

    return products


def encode_image_bytes(image_bytes: bytes) -> str:
    """Encode raw image bytes to base64 data URL."""
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def analyze_with_gpt(image_bytes: bytes, page_shades: List[Dict]) -> Dict:
    """
    Use GPT-4o (vision) to:
      - analyze skin tone / undertone
      - pick the best matching shades from page_shades

    Returns a dict like:
    {
      "skin_tone": "medium",
      "undertone": "cool",
      "depth": 6,
      "best_shades": ["Sleepy Girl", "Spicy Marg"]
    }
    """

    # Turn shade list into readable text for GPT
    if page_shades:
        shade_lines = []
        for s in page_shades:
            name = s.get("shadeName", "Unknown")
            desc = s.get("description", "")
            sku = s.get("sku", "")
            shade_lines.append(f"- {name} ({desc}) [sku: {sku}]")
        shade_text = "\n".join(shade_lines)
    else:
        shade_text = "None provided."

    prompt = f"""
You are a professional beauty shade-matching expert.

Given:
- A selfie of the user (face image).
- A list of shades from the current product page.

Your tasks:
1. Analyze the face in the image and determine:
   - skin_tone: one of ["light", "light-medium", "medium", "tan", "deep"]
   - undertone: one of ["cool", "warm", "neutral", "olive"]
   - depth: an integer from 1 (very light) to 10 (very deep) indicating shade depth.

2. From this shade list:

{shade_text}

Pick the 2–3 BEST matching shades for this user.
Prefer shades close in depth and correct undertone.

Respond ONLY with a JSON object in this format:

{{
  "skin_tone": "medium",
  "undertone": "cool",
  "depth": 6,
  "best_shades": ["Shade Name 1", "Shade Name 2"]
}}
"""

    image_data_url = encode_image_bytes(image_bytes)

    response = client.chat.completions.create(
        model="gpt-4o-mini",  # or "gpt-4o" if you want higher quality
        messages=[
            {
                "role": "system",
                "content": "You are a precise and honest beauty shade-matching AI."
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt.strip()
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_data_url
                        }
                    },
                ],
            },
        ],
        response_format={"type": "json_object"},
        max_tokens=300,
    )

    content = response.choices[0].message.content
    try:
        data = json.loads(content)
    except Exception:
        # very defensive: if GPT doesn't follow JSON perfectly
        raise HTTPException(status_code=500, detail="Failed to parse GPT response")

    return data

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_image(
    file: UploadFile = File(...),
    brand: str = Form("generic"),
    available_shades: Optional[str] = Form(None),
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported.")

    image_bytes = await file.read()

    # Basic validation: make sure it is an image
    try:
        Image.open(io.BytesIO(image_bytes))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image.")

    # Parse shades from content script (Sephora swatches etc.)
    page_shades: List[Dict] = []
    if available_shades:
        try:
            page_shades = json.loads(available_shades)
        except Exception as e:
            print("Error parsing available_shades:", e)
            page_shades = []

    # ---- GPT-4 vision analysis ----
    if page_shades:
        try:
            gpt_result = analyze_with_gpt(image_bytes, page_shades)
            skin_tone = gpt_result.get("skin_tone", "medium")
            undertone = gpt_result.get("undertone", "neutral")
            best_shades = gpt_result.get("best_shades", [])
        except HTTPException:
            # bubble up
            raise
        except Exception as e:
            # fallback if GPT call fails
            print("Error calling GPT:", e)
            skin_tone = "medium"
            undertone = "neutral"
            best_shades = []
    else:
        # No shades from page – you can either:
        # - still ask GPT just for tone/undertone, or
        # - stub it. For now, ask GPT without shade list:
        try:
            gpt_result = analyze_with_gpt(image_bytes, [])
            skin_tone = gpt_result.get("skin_tone", "medium")
            undertone = gpt_result.get("undertone", "neutral")
        except Exception as e:
            print("Error calling GPT (no page shades):", e)
            skin_tone = "medium"
            undertone = "neutral"
        best_shades = []

    # Build Product objects from the page shades + GPT's picks
    if page_shades:
        products = build_products_from_page_shades(
            page_shades=page_shades,
            selected_names=best_shades,
            skin_tone=skin_tone,
            undertone=undertone,
            max_results=3,
        )
    else:
        # If no shades on page, you can still return an empty list or
        # fall back to a dummy catalog if you want
        products = []

    return AnalyzeResponse(
        skin_tone=skin_tone,
        undertone=undertone,
        products=products,
    )


@app.post("/generate")
def generate(req: GenerateRequest):
    steps = plan_steps(req.prompt)
    video_paths, voice_paths = [], []
    for i, step in enumerate(steps, start=1):
        video_paths.append(make_clip(step, i))
        voice_paths.append(speak(step["voiceover"], i))
    final_path = merge(video_paths, voice_paths)
    return {"steps": steps, "video": f"/out/{os.path.basename(final_path)}"}

def encode_image_base64(image_bytes: bytes) -> str:
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"

@app.post("/test-gpt")
async def test_gpt_endpoint(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files allowed")

    image_bytes = await file.read()
    image_b64 = encode_image_base64(image_bytes)

    prompt = """
You are a beauty shade-matching expert.
Look at this face image and determine:
- skin_tone: light, light-medium, medium, tan, or deep
- undertone: warm, cool, neutral, or olive
- short reasoning

Return ONLY JSON:
{
  "skin_tone": "...",
  "undertone": "...",
  "reason": "..."
}
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are an expert in skin-tone detection."},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": image_b64}
                        }
                    ]
                }
            ]
        )

        data = response.choices[0].message.content
        return json.loads(data)

    except Exception as e:
        print("GPT error:", e)
        raise HTTPException(status_code=500, detail=str(e))

OUT_DIR = os.path.join(os.getcwd(), "backend", "out")
app.mount("/out", StaticFiles(directory=OUT_DIR), name="out")
