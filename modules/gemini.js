const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { uploadBufferToSpaces } = require('./storage');

let genAI = null;

function getClient(customKey = null) {
    if (customKey) {
        return new GoogleGenAI({ apiKey: customKey });
    }

    if (!genAI) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not configured in .env');
        }
        genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return genAI;
}

/**
 * Process a single image — strict logo editing only.
 * Removes brand logo/name and replaces with ourBrand where removed.
 */
async function processImage(imageUrl, customApiKey = null, brandName = '', ourBrand = 'gigglo') {
    const client = getClient(customApiKey);

    // Download image from URL to buffer
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const imageBuffer = Buffer.from(response.data);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = (response.headers['content-type'] || 'image/jpeg').split(';')[0].trim();

    const brandHint = brandName
        ? `\nThe brand name on this product is "${brandName}". Look specifically for this name or its logo.`
        : '';

    try {
        const aiResponse = await client.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { mimeType, data: base64Image } },
                    {
                        text: `You are a precise product photo editor. This is a MINIMAL EDIT task, NOT image generation.

STRICT RULES — follow every single one:
1. Keep 95-100% of the original image EXACTLY unchanged.
2. Do NOT change the product design, shape, color, texture, material, or any physical feature.
3. Do NOT change the background, lighting, shadows, reflections, or composition.
4. Do NOT redesign, recreate, or regenerate the product image.
5. Do NOT add any new elements, decorations, or effects.
${brandHint}
YOUR ONLY TASK:
- Find any BRAND LOGO or BRAND NAME text printed/displayed on the product or packaging.
- Remove it cleanly by filling with surrounding pixels to match the surface.
- In the EXACT same position and at a SIMILAR size, place the text "${ourBrand}" in a style that looks natural on that surface.

CRITICAL:
- If the image does NOT contain any visible brand logo or brand name text, return the image COMPLETELY UNCHANGED.
- Only replace what was there. Do not invent logo placements.

Output ONLY the edited image.`,
                    },
                ],
            }],
            config: { responseModalities: ['IMAGE', 'TEXT'] },
        });

        if (aiResponse.candidates?.[0]?.content?.parts) {
            for (const part of aiResponse.candidates[0].content.parts) {
                if (part.inlineData) {
                    const outputFilename = `processed_${uuidv4()}.png`;
                    const outputBuffer = Buffer.from(part.inlineData.data, 'base64');
                    const spacesUrl = await uploadBufferToSpaces(outputBuffer, outputFilename, 'processed');
                    return { success: true, originalUrl: imageUrl, spacesUrl, filename: outputFilename };
                }
            }
        }

        console.warn('No image returned from Gemini, using original');
        return { success: false, originalUrl: imageUrl, spacesUrl: imageUrl, filename: path.basename(imageUrl), note: 'Processing returned no image — using original' };
    } catch (error) {
        console.error(`Image processing error: ${error.message}`);
        throw new Error(`AI image processing failed: ${error.message}`);
    }
}

/**
 * Process multiple images sequentially
 */
async function processImages(imageUrls, customApiKey = null, brandName = '', ourBrand = 'gigglo') {
    const results = [];
    let failCount = 0;
    for (let i = 0; i < imageUrls.length; i++) {
        console.log(`Processing image ${i + 1}/${imageUrls.length}...`);
        try {
            const result = await processImage(imageUrls[i], customApiKey, brandName, ourBrand);
            results.push(result);
        } catch (err) {
            console.error(`Image ${i + 1} failed: ${err.message}`);
            failCount++;
            results.push({
                success: false,
                originalUrl: imageUrls[i],
                spacesUrl: imageUrls[i],
                filename: path.basename(imageUrls[i]),
                error: err.message,
            });
        }
        if (i < imageUrls.length - 1) await new Promise(r => setTimeout(r, 1000));
    }
    if (failCount === imageUrls.length) {
        throw new Error(`All ${failCount} images failed to process. Check your API key quota.`);
    }
    return results;
}

/**
 * Process a SINGLE image with a user-provided custom prompt
 */
async function processImageWithPrompt(imageUrl, customPrompt, customApiKey = null) {
    const client = getClient(customApiKey);

    // Download image from URL to buffer
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const imageBuffer = Buffer.from(response.data);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = (response.headers['content-type'] || 'image/jpeg').split(';')[0].trim();

    try {
        const aiResponse = await client.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { mimeType, data: base64Image } },
                    {
                        text: `You are a precise product photo editor. Edit this product image according to the user's instructions below.

IMPORTANT: Keep the product and composition as close to the original as possible. Only make the changes the user asks for.

USER'S INSTRUCTIONS:
${customPrompt}

Output ONLY the edited image.`,
                    },
                ],
            }],
            config: { responseModalities: ['IMAGE', 'TEXT'] },
        });

        if (aiResponse.candidates?.[0]?.content?.parts) {
            for (const part of aiResponse.candidates[0].content.parts) {
                if (part.inlineData) {
                    const outputFilename = `processed_${uuidv4()}.png`;
                    const outputBuffer = Buffer.from(part.inlineData.data, 'base64');
                    const spacesUrl = await uploadBufferToSpaces(outputBuffer, outputFilename, 'processed');
                    return { success: true, originalUrl: imageUrl, spacesUrl, filename: outputFilename };
                }
            }
        }

        throw new Error('AI returned no edited image — the model may not have understood the prompt');
    } catch (error) {
        console.error(`Custom image processing error: ${error.message}`);
        throw new Error(`AI image regeneration failed: ${error.message}`);
    }
}

/**
 * Generate structured product description JSON.
 * Returns a parsed object ready for the master HTML template.
 */
async function generateDescriptionJSON(productData, customApiKey = null) {
    const client = getClient(customApiKey);

    const prompt = `You are a professional Shopify product copywriter and conversion specialist.

Based on the following product information, generate STRUCTURED PRODUCT DATA as a JSON object.

Product Title: ${productData.title}
Original Description: ${productData.description || 'Not available'}
Brand (DO NOT mention this brand anywhere): ${productData.brand || 'Unknown'}
Price: ${productData.price} ${productData.currency}

Return a JSON object with EXACTLY these fields:

{
  "tagline": "A short, punchy marketing tagline (max 10 words)",
  "intro": "A benefit-driven intro paragraph (2-3 sentences, max 40 words)",
  "angles": [
    { "emoji": "🎯", "title": "Benefit title", "description": "Short benefit description (max 15 words)" },
    { "emoji": "💡", "title": "Second benefit", "description": "Short description" },
    { "emoji": "⚡", "title": "Third benefit", "description": "Short description" }
  ],
  "box_items": [
    { "emoji": "📦", "name": "Item name", "description": "What it is or does" }
  ],
  "features": [
    { "name": "Feature name", "value": "Feature detail" }
  ],
  "promise": [
    { "emoji": "🛡️", "title": "Quality Assurance", "description": "Short trust signal" },
    { "emoji": "💬", "title": "Customer Support", "description": "Short trust signal" },
    { "emoji": "↩️", "title": "Easy Returns", "description": "Short trust signal" }
  ],
  "reviews": [
    { "rating": 5, "text": "Short believable review (max 20 words)", "name": "Customer Name", "city": "City" },
    { "rating": 5, "text": "Another review", "name": "Name", "city": "City" },
    { "rating": 4, "text": "Another review", "name": "Name", "city": "City" }
  ],
  "faqs": [
    { "question": "Common customer question?", "answer": "Clear short answer" }
  ],
  "delivery": [
    { "emoji": "🚚", "text": "Free shipping above ₹599" },
    { "emoji": "📦", "text": "Delivery in 3-5 days" },
    { "emoji": "💳", "text": "Cash on delivery available" }
  ]
}

RULES:
- DO NOT mention the original brand name ANYWHERE.
- Generate 3 angles, 2-4 box_items, 4-6 features, 3 promise items, 3 reviews, 3-5 FAQs, 2-3 delivery items.
- Keep all text SHORT and punchy — this is for e-commerce, not a blog.
- Make reviews sound natural and believable, not generic.
- FAQs should address real customer concerns about this specific product type.
- Return ONLY valid JSON. No markdown, no code fences, no explanation.`;

    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        let text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        // Clean up any markdown fences
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(text);
    } catch (error) {
        console.error(`Description JSON generation error: ${error.message}`);
        // Return minimal fallback
        return {
            tagline: productData.title,
            intro: productData.description || '',
            angles: [],
            box_items: [],
            features: [],
            promise: [],
            reviews: [],
            faqs: [],
            delivery: [],
        };
    }
}

/**
 * Regenerate description JSON with a custom user prompt applied.
 */
async function generateDescriptionJSONWithPrompt(productData, customPrompt, existingJSON, customApiKey = null) {
    const client = getClient(customApiKey);

    const existingContext = existingJSON ? `\nCurrent JSON data:\n${JSON.stringify(existingJSON, null, 2)}\n` : '';

    const prompt = `You are a professional Shopify product copywriter.

Product Title: ${productData.title}
Current Description: ${productData.description || 'Not available'}
Price: ${productData.price} ${productData.currency}
${existingContext}
USER'S CUSTOM INSTRUCTIONS:
${customPrompt}

Based on the user's instructions above, regenerate the product description data as a JSON object.

Apply the user's instructions to modify the content. Keep the same JSON structure:
{
  "tagline": "string",
  "intro": "string",
  "angles": [{ "emoji": "string", "title": "string", "description": "string" }],
  "box_items": [{ "emoji": "string", "name": "string", "description": "string" }],
  "features": [{ "name": "string", "value": "string" }],
  "promise": [{ "emoji": "string", "title": "string", "description": "string" }],
  "reviews": [{ "rating": 5, "text": "string", "name": "string", "city": "string" }],
  "faqs": [{ "question": "string", "answer": "string" }],
  "delivery": [{ "emoji": "string", "text": "string" }]
}

RULES:
- Apply the user's custom instructions to modify tone, emphasis, or content.
- Keep text short and punchy for e-commerce.
- Return ONLY valid JSON. No markdown, no code fences.`;

    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        let text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(text);
    } catch (error) {
        console.error(`Custom description JSON generation error: ${error.message}`);
        return existingJSON || {
            tagline: productData.title,
            intro: productData.description || '',
            angles: [], box_items: [], features: [], promise: [], reviews: [], faqs: [], delivery: [],
        };
    }
}

/**
 * Generate a clean product title without brand references
 */
async function generateTitle(productData, customApiKey = null) {
    const client = getClient(customApiKey);

    const prompt = `Given this product title: "${productData.title}"
And brand name: "${productData.brand || 'Unknown'}"

Rewrite the product title to remove any brand references while keeping the product description accurate and appealing. 
Keep it concise (3-10 words max). Return ONLY the new title, nothing else.`;

    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || productData.title;
    } catch (error) {
        console.error(`Title generation error: ${error.message}`);
        return productData.title;
    }
}

/**
 * Get MIME type from file path
 */
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
    };
    return types[ext] || 'image/jpeg';
}

module.exports = {
    processImage,
    processImages,
    processImageWithPrompt,
    generateDescriptionJSON,
    generateDescriptionJSONWithPrompt,
    generateTitle,
};
