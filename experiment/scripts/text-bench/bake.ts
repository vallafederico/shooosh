import { generateFontAtlas } from '../../../package/msdf/fonts';
await generateFontAtlas('experiment/assets/Abel-Regular.ttf', {
  outDir:'experiment/public/text-bench', name:'abel-msdf', fontSize:64,
  fieldType:'msdf', distanceRange:8, textureSize:[512,512], charset:'GPUtext0123456789'
});
await generateFontAtlas('experiment/assets/Abel-Regular.ttf', {
  outDir:'experiment/public/text-bench', name:'abel-sdf', fontSize:64,
  fieldType:'sdf', distanceRange:8, textureSize:[512,512], charset:'GPUtext0123456789'
});
