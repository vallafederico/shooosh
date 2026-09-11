"""Mechanical GLSL translation of pinned HLSL reference; nonzero fill, no optical boost."""
from pathlib import Path
import re
source=Path('experiment/src/text-bench/vendor/slug/SlugPixelShader.hlsl').read_text(encoding='latin1')
source=source[:source.index('struct VertexStruct')]
source=re.sub(r'//[^\n]*','',source)
for old,new in [('Texture2D<uint4>','usampler2D'),('Texture2D','sampler2D'),('float4','vec4'),('float2','vec2'),('int4','ivec4'),('int2','ivec2'),('uint2','uvec2'),('asuint','floatBitsToUint')]: source=source.replace(old,new)
source=source.replace('uivec2','uvec2')
source=source.replace('#define TexelLoad2D(x, y) x.Load(int3(y, 0))','#define TexelLoad2D(x, y) texelFetch(x, y, 0)')
source=re.sub(r'\b([0-9A-Fa-fx]+)U\b',r'\1u',source)
source='#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\nprecision highp usampler2D;\nfloat saturate(float x){return clamp(x,0.0,1.0);}\n'+source
source+='\nuniform sampler2D curveTexture;\nuniform usampler2D bandTexture;\nin vec2 em;\nflat in vec4 band;\nflat in int row;\nout vec4 color;\nvoid main(){float c=SlugRender(curveTexture,bandTexture,em,band,ivec4(0,row,7,7));color=vec4(c);}\n'
Path('experiment/src/text-bench/slug.frag.glsl').write_text(source.replace('#version 300 es\n','#version 300 es\n// Port of Eric Lengyel Slug reference, MIT, Copyright 2017 Eric Lengyel. See vendor/slug.\n'))
