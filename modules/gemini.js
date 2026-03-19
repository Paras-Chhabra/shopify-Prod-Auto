const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const PROCESSED_DIR = path.join(__dirname, '..', 'temp', 'processed');

// Ensure processed directory exists
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });

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
 * Removes brand logo/name and replaces with "gigglo" where removed.
 */
async function processImage(imagePath, customApiKey = null, brandName = '') {
    const client = getClient(customApiKey);

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(imagePath);

    const brandHint = brandName
        ? `\nThe brand name on this product is "${brandName}". Look specifically for this name or its logo.`
        : '';

    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType,
                            data: base64Image,
                        },
                    },
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
- In the EXACT same position and at a SIMILAR size, place the text "gigglo" in a style that looks natural on that surface (matching the approximate font weight, color that contrasts with the surface, and orientation of the original brand text).

CRITICAL:
- If the image does NOT contain any visible brand logo or brand name text, return the image COMPLETELY UNCHANGED. Do NOT add "gigglo" anywhere.
- Only replace what was there. Do not invent logo placements.

Output ONLY the edited image.`,
                    },
                ],
            }],
            config: {
                responseModalities: ['IMAGE', 'TEXT'],
            },
        });

        if (response.candidates && response.candidates[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const outputFilename = `processed_${uuidv4()}.png`;
                    const outputPath = path.join(PROCESSED_DIR, outputFilename);
                    const outputBuffer = Buffer.from(part.inlineData.data, 'base64');
                    fs.writeFileSync(outputPath, outputBuffer);
                    console.log(`Image processed successfully: ${outputPath}`);
                    return {
                        success: true,
                        originalPath: imagePath,
                        processedPath: outputPath,
                        filename: outputFilename,
                    };
                }
            }
        }

        console.warn('No image returned, using original');
        return {
            success: false,
            originalPath: imagePath,
            processedPath: imagePath,
            filename: path.basename(imagePath),
            note: 'Processing returned no image - using original',
        };
    } catch (error) {
        console.error(`Image processing error: ${error.message}`);
        return {
            success: false,
            originalPath: imagePath,
            processedPath: imagePath,
            filename: path.basename(imagePath),
            error: error.message,
        };
    }
}

/**
 * Process multiple images sequentially
 */
async function processImages(imagePaths, customApiKey = null, brandName = '') {
    const results = [];
    for (let i = 0; i < imagePaths.length; i++) {
        console.log(`Processing image ${i + 1}/${imagePaths.length}...`);
        const result = await processImage(imagePaths[i], customApiKey, brandName);
        results.push(result);
        if (i < imagePaths.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return results;
}

/**
 * Process a SINGLE image with a user-provided custom prompt
 */
async function processImageWithPrompt(imagePath, customPrompt, customApiKey = null) {
    const client = getClient(customApiKey);

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(imagePath);

    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType,
                            data: base64Image,
                        },
                    },
                    {
                        text: `You are a precise product photo editor. Edit this product image according to the user's instructions below.

IMPORTANT: Keep the product and composition as close to the original as possible. Only make the changes the user asks for.

USER'S INSTRUCTIONS:
${customPrompt}

Output ONLY the edited image.`,
                    },
                ],
            }],
            config: {
                responseModalities: ['IMAGE', 'TEXT'],
            },
        });

        if (response.candidates && response.candidates[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const outputFilename = `processed_${uuidv4()}.png`;
                    const outputPath = path.join(PROCESSED_DIR, outputFilename);
                    const outputBuffer = Buffer.from(part.inlineData.data, 'base64');
                    fs.writeFileSync(outputPath, outputBuffer);
                    console.log(`Image processed with custom prompt: ${outputPath}`);
                    return {
                        success: true,
                        originalPath: imagePath,
                        processedPath: outputPath,
                        filename: outputFilename,
                    };
                }
            }
        }

        console.warn('No image returned for custom prompt, using original');
        return {
            success: false,
            originalPath: imagePath,
            processedPath: imagePath,
            filename: path.basename(imagePath),
            note: 'Custom processing failed - using original image',
        };
    } catch (error) {
        console.error(`Custom image processing error: ${error.message}`);
        return {
            success: false,
            originalPath: imagePath,
            processedPath: imagePath,
            filename: path.basename(imagePath),
            error: error.message,
        };
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
async function generateTitle(productData) {
    const client = getClient();

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
