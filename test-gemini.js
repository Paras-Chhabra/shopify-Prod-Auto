const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

async function test() {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const imageBuffer = fs.readFileSync('/Users/paraschhabra/.gemini/antigravity/scratch/shopify-product-automator/temp/320c4a84-9067-497b-8923-51156af8a91c.jpg');

  const models = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview'];

  for (const model of models) {
    console.log(`\n--- Testing ${model} ---`);
    try {
      const response = await client.models.generateContent({
        model: model,
        contents: [{
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imageBuffer.toString('base64'),
              },
            },
            {
              text: 'Edit this product image: remove any brand logos or brand text visible on the product. Keep everything else exactly the same. Return the edited image.',
            },
          ],
        }],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
        },
      });

      console.log('Finish reason:', response.candidates?.[0]?.finishReason);
      const parts = response.candidates?.[0]?.content?.parts || [];
      console.log('Parts count:', parts.length);

      for (const part of parts) {
        if (part.inlineData) {
          const safeName = model.replace(/\./g, '_');
          const outPath = `/Users/paraschhabra/.gemini/antigravity/scratch/shopify-product-automator/temp/processed/test_${safeName}.png`;
          fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, 'base64'));
          console.log(`SUCCESS! Image saved to: ${outPath}`);
        }
        if (part.text) {
          console.log('Text:', part.text.substring(0, 200));
        }
      }
    } catch (e) {
      console.error(`Error with ${model}:`, e.message.substring(0, 300));
    }
  }
}
test();
