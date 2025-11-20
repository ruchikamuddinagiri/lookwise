import os, json
from dotenv import load_dotenv
load_dotenv() 
from openai import OpenAI

SYSTEM_PROMPT = """You are a professional makeup artist.
Given a user's request (eye shape, look type, etc.), return JSON list of step-by-step tutorial actions.
Each step should include: step, title, action, tools, duration_sec, caption, voiceover.
Keep it short and easy to follow.
"""

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def plan_steps(prompt: str):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role":"system","content":SYSTEM_PROMPT},
            {"role":"user","content":prompt}
        ],
        temperature=0.5,
    )
    text = response.choices[0].message.content.strip()
    start, end = text.find("["), text.rfind("]")
    json_text = text[start:end+1] if start!=-1 and end!=-1 else "[]"
    return json.loads(json_text)
