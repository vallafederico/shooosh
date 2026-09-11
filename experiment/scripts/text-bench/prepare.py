"""Offline Slug curve/band packer. Requires fonttools==4.61.1 or newer.
Usage: python prepare.py FONT.ttf OUTPUT.json
Quadratic TrueType outlines only; BasePen resolves implied points/composites.
"""
import sys, json, hashlib
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
font_path, output = sys.argv[1:]
font = TTFont(font_path)
if 'glyf' not in font: raise ValueError('Only quadratic TrueType outlines supported')
units = font['head'].unitsPerEm
glyphset = font.getGlyphSet()
class Pen(BasePen):
    def __init__(self):
        super().__init__(glyphset); self.curves = []; self.start = None; self.current = None
    def _moveTo(self, p): self.start = self.current = p
    def _lineTo(self, p): self._qCurveToOne(p, p)
    def _qCurveToOne(self, control, end):
        self.curves.append([v / units for p in (self.current, control, end) for v in p]); self.current = end
    def _curveToOne(self, *args): raise ValueError('Cubic outline unsupported')
    def _closePath(self):
        if self.current != self.start: self._lineTo(self.start)
    def _endPath(self): self._closePath()
curves, bands, glyphs = [], [], {}
# One row per glyph in each 4096-wide texture. Lists never cross a row.
for row, char in enumerate(dict.fromkeys('GPUtext0123456789')):
    pen = Pen(); glyphset[font.getBestCmap()[ord(char)]].draw(pen)
    cs = pen.curves
    xs = [c[i] for c in cs for i in (0,2,4)]; ys = [c[i] for c in cs for i in (1,3,5)]
    bounds = [min(xs), min(ys), max(xs), max(ys)]
    n = 8; headers = []; refs = []
    for axis in (1,0):
        lo, hi = bounds[axis], bounds[axis+2]
        for b in range(n):
            lower = lo+(hi-lo)*b/n-1/1024; upper = lo+(hi-lo)*(b+1)/n+1/1024
            selected = [i for i,c in enumerate(cs) if min(c[axis::2]) <= upper and max(c[axis::2]) >= lower and len(set(c[axis::2])) > 1]
            selected.sort(key=lambda i:max(cs[i][1-axis::2]), reverse=True)
            headers.append([len(selected),2*n+len(refs)])
            refs.extend([[2*i,row] for i in selected])
    assert len(cs)*2 <= 4096 and len(headers)+len(refs) <= 4096
    curves.append([v for c in cs for v in (*c[:4],*c[4:],0,0)])
    bands.append(headers+refs)
    glyphs[char] = {'row':row,'bounds':bounds,'bandTransform':[n/(bounds[2]-bounds[0]),n/(bounds[3]-bounds[1]),-bounds[0]*n/(bounds[2]-bounds[0]),-bounds[1]*n/(bounds[3]-bounds[1])]}
with open(output,'w') as f: json.dump({'sha256':hashlib.sha256(open(font_path,'rb').read()).hexdigest(),'glyphs':glyphs,'curves':curves,'bands':bands,'bandsPerAxis':8},f,separators=(',',':'))
