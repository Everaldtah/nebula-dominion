# App icon from the Kaggle-generated Trooper concept portrait: dark rounded tile + amber ring + trooper cut-out.
from PIL import Image, ImageDraw
from pathlib import Path
here = Path(__file__).parent
S = 256
tile = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(tile)
d.rounded_rectangle((4, 4, S - 4, S - 4), 44, fill=(12, 18, 30, 255), outline=(255, 179, 71, 255), width=8)
por = Image.open(here.parent / 'public' / 'portraits' / 'trooper.webp').convert('RGBA')
bb = por.getbbox(); por = por.crop(bb) if bb else por
por.thumbnail((S - 44, S - 44), Image.LANCZOS)
tile.alpha_composite(por, ((S - por.width) // 2, (S - por.height) // 2 + 6))
tile.save(here / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
tile.save(here / 'icon.png')
print('icon ok', por.size)
