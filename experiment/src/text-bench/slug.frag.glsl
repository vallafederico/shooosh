#version 300 es
// Port of Eric Lengyel Slug reference, MIT, Copyright 2017 Eric Lengyel. See vendor/slug.
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
float saturate(float x){return clamp(x,0.0,1.0);}









#define kLogBandTextureWidth 12



#define TexelLoad2D(x, y) texelFetch(x, y, 0)


uint CalcRootCode(float y1, float y2, float y3)
{
	
	

	uint i1 = floatBitsToUint(y1) >> 31u;
	uint i2 = floatBitsToUint(y2) >> 30u;
	uint i3 = floatBitsToUint(y3) >> 29u;

	uint shift = (i2 & 2u) | (i1 & ~2u);
	shift = (i3 & 4u) | (shift & ~4u);

	

	return ((0x2E74u >> shift) & 0x0101u);
}

vec2 SolveHorizPoly(vec4 p12, vec2 p3)
{
	
	
	
	
	
	
	
	
	

	vec2 a = p12.xy - p12.zw * 2.0 + p3;
	vec2 b = p12.xy - p12.zw;
	float ra = 1.0 / a.y;
	float rb = 0.5 / b.y;

	float d = sqrt(max(b.y * b.y - a.y * p12.y, 0.0));
	float t1 = (b.y - d) * ra;
	float t2 = (b.y + d) * ra;

	

	if (abs(a.y) < 1.0 / 65536.0) t1 = t2 = p12.y * rb;

	

	return (vec2((a.x * t1 - b.x * 2.0) * t1 + p12.x, (a.x * t2 - b.x * 2.0) * t2 + p12.x));
}

vec2 SolveVertPoly(vec4 p12, vec2 p3)
{
	

	vec2 a = p12.xy - p12.zw * 2.0 + p3;
	vec2 b = p12.xy - p12.zw;
	float ra = 1.0 / a.x;
	float rb = 0.5 / b.x;

	float d = sqrt(max(b.x * b.x - a.x * p12.x, 0.0));
	float t1 = (b.x - d) * ra;
	float t2 = (b.x + d) * ra;

	

	if (abs(a.x) < 1.0 / 65536.0) t1 = t2 = p12.x * rb;

	

	return (vec2((a.y * t1 - b.y * 2.0) * t1 + p12.y, (a.y * t2 - b.y * 2.0) * t2 + p12.y));
}

ivec2 CalcBandLoc(ivec2 glyphLoc, uint offset)
{
	

	ivec2 bandLoc = ivec2(glyphLoc.x + int(offset), glyphLoc.y);
	bandLoc.y += bandLoc.x >> kLogBandTextureWidth;
	bandLoc.x &= (1 << kLogBandTextureWidth) - 1;
	return (bandLoc);
}

float CalcCoverage(float xcov, float ycov, float xwgt, float ywgt, int flags)
{
	
	

	float coverage = max(abs(xcov * xwgt + ycov * ywgt) / max(xwgt + ywgt, 1.0 / 65536.0), min(abs(xcov), abs(ycov)));

	

	#if defined(SLUG_EVENODD)

		if ((flags & 0x1000) == 0)
		{

	#endif

			

			coverage = saturate(coverage);

	#if defined(SLUG_EVENODD)

		}
		else
		{
			

			coverage = 1.0 - abs(1.0 - frac(coverage * 0.5) * 2.0);
		}

	#endif

	

	#if defined(SLUG_WEIGHT)

		coverage = sqrt(coverage);

	#endif

	return (coverage);
}

float SlugRender(sampler2D curveData, usampler2D bandData, vec2 renderCoord, vec4 bandTransform, ivec4 glyphData)
{
	int curveIndex;

	
	

	vec2 emsPerPixel = fwidth(renderCoord);
	vec2 pixelsPerEm = 1.0 / emsPerPixel;

	ivec2 bandMax = glyphData.zw;
	bandMax.y &= 0x00FF;

	
	
	

	ivec2 bandIndex = clamp(ivec2(renderCoord * bandTransform.xy + bandTransform.zw), ivec2(0, 0), bandMax);
	ivec2 glyphLoc = glyphData.xy;

	float xcov = 0.0;
	float xwgt = 0.0;

	
	
	

	uvec2 hbandData = TexelLoad2D(bandData, ivec2(glyphLoc.x + bandIndex.y, glyphLoc.y)).xy;
	ivec2 hbandLoc = CalcBandLoc(glyphLoc, hbandData.y);

	

	for (curveIndex = 0; curveIndex < int(hbandData.x); curveIndex++)
	{
		

		ivec2 curveLoc = ivec2(TexelLoad2D(bandData, ivec2(hbandLoc.x + curveIndex, hbandLoc.y)).xy);

		
		
		
		
		
		
		

		vec4 p12 = TexelLoad2D(curveData, curveLoc) - vec4(renderCoord, renderCoord);
		vec2 p3 = TexelLoad2D(curveData, ivec2(curveLoc.x + 1, curveLoc.y)).xy - renderCoord;

		
		
		
		

		if (max(max(p12.x, p12.z), p3.x) * pixelsPerEm.x < -0.5) break;

		uint code = CalcRootCode(p12.y, p12.w, p3.y);
		if (code != 0u)
		{
			
			

			vec2 r = SolveHorizPoly(p12, p3) * pixelsPerEm.x;

			

			if ((code & 1u) != 0u)
			{
				xcov += saturate(r.x + 0.5);
				xwgt = max(xwgt, saturate(1.0 - abs(r.x) * 2.0));
			}

			if (code > 1u)
			{
				xcov -= saturate(r.y + 0.5);
				xwgt = max(xwgt, saturate(1.0 - abs(r.y) * 2.0));
			}
		}
	}

	float ycov = 0.0;
	float ywgt = 0.0;

	
	

	uvec2 vbandData = TexelLoad2D(bandData, ivec2(glyphLoc.x + bandMax.y + 1 + bandIndex.x, glyphLoc.y)).xy;
	ivec2 vbandLoc = CalcBandLoc(glyphLoc, vbandData.y);

	

	for (curveIndex = 0; curveIndex < int(vbandData.x); curveIndex++)
	{
		ivec2 curveLoc = ivec2(TexelLoad2D(bandData, ivec2(vbandLoc.x + curveIndex, vbandLoc.y)).xy);
		vec4 p12 = TexelLoad2D(curveData, curveLoc) - vec4(renderCoord, renderCoord);
		vec2 p3 = TexelLoad2D(curveData, ivec2(curveLoc.x + 1, curveLoc.y)).xy - renderCoord;

		
		
		
		

		if (max(max(p12.y, p12.w), p3.y) * pixelsPerEm.y < -0.5) break;

		uint code = CalcRootCode(p12.x, p12.z, p3.x);
		if (code != 0u)
		{
			vec2 r = SolveVertPoly(p12, p3) * pixelsPerEm.y;

			if ((code & 1u) != 0u)
			{
				ycov -= saturate(r.x + 0.5);
				ywgt = max(ywgt, saturate(1.0 - abs(r.x) * 2.0));
			}

			if (code > 1u)
			{
				ycov += saturate(r.y + 0.5);
				ywgt = max(ywgt, saturate(1.0 - abs(r.y) * 2.0));
			}
		}
	}

	return (CalcCoverage(xcov, ycov, xwgt, ywgt, glyphData.w));
}


uniform sampler2D curveTexture;
uniform usampler2D bandTexture;
in vec2 em;
flat in vec4 band;
flat in int row;
out vec4 color;
void main(){float c=SlugRender(curveTexture,bandTexture,em,band,ivec4(0,row,7,7));color=vec4(c);}
