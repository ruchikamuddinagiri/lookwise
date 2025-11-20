import os
from gtts import gTTS

OUT_DIR = os.path.join(os.getcwd(), "backend", "out")
os.makedirs(OUT_DIR, exist_ok=True)

def speak(text, idx):
    path = os.path.join(OUT_DIR, f"voice_{idx:02d}.mp3")
    tts = gTTS(text=text, lang="en")
    tts.save(path)
    return path
