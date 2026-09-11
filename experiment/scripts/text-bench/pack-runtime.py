"""Build GPU-ready binary textures; no row packing/float conversion in browser."""
from pathlib import Path
import json,struct
root=Path('experiment/public/text-bench')
a=json.loads(Path('experiment/assets/abel-slug.json').read_text())
curves=bytearray(4096*len(a['curves'])*8)
bands=bytearray(4096*len(a['bands'])*4)
for row, values in enumerate(a['curves']):
 for i,v in enumerate(values): struct.pack_into('<e',curves,row*4096*8+i*2,v)
for row, values in enumerate(a['bands']):
 for i,xy in enumerate(values): struct.pack_into('<HH',bands,row*4096*4+i*4,*xy)
(root/'abel-curves.bin').write_bytes(curves)
(root/'abel-bands.bin').write_bytes(bands)
(root/'abel-metadata.json').write_text(json.dumps({'sha256':a['sha256'],'glyphs':a['glyphs'],'rows':len(a['curves'])},separators=(',',':')))
