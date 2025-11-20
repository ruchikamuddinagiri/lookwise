import os
from moviepy import VideoFileClip, AudioFileClip, concatenate_videoclips

OUT_DIR = os.path.join(os.getcwd(), "backend", "out")
os.makedirs(OUT_DIR, exist_ok=True)

def merge(videos, voices, out_name="tutorial.mp4"):
    clips = []
    for v, a in zip(videos, voices):
        vid = VideoFileClip(v)
        aud = AudioFileClip(a)
        clips.append(vid.set_audio(aud))
    final = concatenate_videoclips(clips)
    out_path = os.path.join(OUT_DIR, out_name)
    final.write_videofile(out_path, fps=30, codec="libx264", audio_codec="aac", verbose=False, logger=None)
    for c in clips: c.close()
    return out_path
