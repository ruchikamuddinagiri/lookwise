import os
from moviepy import ColorClip, TextClip, CompositeVideoClip

OUT_DIR = os.path.join(os.getcwd(), "backend", "out")
os.makedirs(OUT_DIR, exist_ok=True)

def make_clip(step, idx, width=1080, height=1920):
    dur = step.get("duration_sec", 5)
    bg = ColorClip(size=(width, height), color=(30, 30, 34), duration=dur)

    title = TextClip(
        text=step["title"],
        font=None,
        font_size=70,
        size=(width - 200, None),
        color="white",
        method="label",
        text_align="center"
    ).with_position(("center", height * 0.3)).with_duration(dur)

    caption = TextClip(
        text=step["caption"],
        font=None,
        font_size=48,
        size=(width - 200, None),
        color="white",
        method="label",
        text_align="center"
    ).with_position(("center", height * 0.55)).with_duration(dur)

    comp = CompositeVideoClip([bg, title, caption])
    path = os.path.join(OUT_DIR, f"step_{idx:02d}.mp4")

    comp.write_videofile(path, fps=30, codec="libx264", audio=False)

    return path
