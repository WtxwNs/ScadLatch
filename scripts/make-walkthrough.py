"""Assemble an explicitly edited walkthrough from actual UI captures.

Requires ffmpeg (or the optional imageio-ffmpeg Python package). No geometry,
controls, or results are drawn into the screenshots by this script.
"""
from pathlib import Path
import shutil
import subprocess

media = Path(__file__).resolve().parents[1] / 'docs' / 'media'
ffmpeg = shutil.which('ffmpeg')
if not ffmpeg:
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
shots = [
    ('01-original.jpg', '01 / Start with an existing parametric tray.'),
    ('02-preview.jpg', '02 / Select its right face. Set a rectangular opening.'),
    ('03-opening.jpg', '03 / Apply. OpenSCAD cuts the actual solid.'),
    ('04-parameters.jpg', '04 / Change the original width from 100 to 140 mm.'),
    ('05-resized.jpg', '05 / The opening stays on the resized right wall.'),
    ('06-export.jpg', '06 / Take the editable source and STL with you.'),
]
for filename, _ in shots:
    if not (media / filename).is_file():
        raise SystemExit(f'Missing real UI capture: {filename}')
concat = ''.join(f"file '{name}'\nduration 7\n" for name, _ in shots) + f"file '{shots[-1][0]}'\n"
(media / 'walkthrough-frames.txt').write_text(concat, encoding='utf-8')
font = "fontfile='C\\:/Windows/Fonts/segoeui.ttf':" if Path('C:/Windows/Fonts/segoeui.ttf').exists() else ''
filters = ['fps=24', 'pad=ceil(iw/2)*2:ceil((ih+82)/2)*2:0:0:color=0x192e37']
for i, (_, caption) in enumerate(shots):
    (media / f'caption-{i}.txt').write_text(caption, encoding='utf-8')
    filters.append(f"drawtext={font}textfile=caption-{i}.txt:fontcolor=0xedf1e6:fontsize=18:x=20:y=h-65:enable='between(t,{i*7},{(i+1)*7})'")
(media / 'capture-note.txt').write_text('Real local run · edited screen sequence · builds took 0.3–0.4 s', encoding='utf-8')
filters.append(f'drawtext={font}textfile=capture-note.txt:fontcolor=0xa6b5b1:fontsize=13:x=20:y=h-32')
subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'warning', '-y', '-f', 'concat', '-safe', '0', '-i', 'walkthrough-frames.txt',
    '-vf', ','.join(filters), '-t', '42', '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'walkthrough.mp4'], cwd=media, check=True)
print(media / 'walkthrough.mp4')
