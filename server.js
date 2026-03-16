require('dotenv').config();
const express = require('express');
const path = require('path');
const { scrapeProduct } = require('./modules/scraper');
const { processImages, processImageWithPrompt, generateDescriptionJSON, generateDescriptionJSONWithPrompt, generateTitle } = require('./modules/gemini');
const { testConnection, uploadFile, createProduct } = require('./modules/shopify');
const { runSingle, runBatch, getJob } = require('./modules/pipeline');
const { productTemplate } = require('./templates/productDescriptionTemplate');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// Serve temp directory for image previews
app.use('/temp', express.static(path.join(__dirname, 'temp')));

// ============================================================
// API Routes
// ============================================================

/**
 * Test Shopify connection
 */
app.get('/api/test-connection', async (req, res) => {
    try {
        const result = await testConnection();
        res.json(result);
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

/**
 * Scrape product data from a URL
 */
app.post('/api/scrape', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        console.log(`Scraping: ${url}`);
        const data = await scrapeProduct(url);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Scrape error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Process images with AI (batch — all images at once)
 */
app.post('/api/process-images', async (req, res) => {
    try {
        const { imagePaths } = req.body;
        if (!imagePaths || !imagePaths.length) {
            return res.status(400).json({ error: 'imagePaths array is required' });
        }

        console.log(`Processing ${imagePaths.length} images...`);
        const results = await processImages(imagePaths);
        res.json({ success: true, results });
    } catch (error) {
        console.error('Image processing error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Process a SINGLE image with a custom prompt (per-image regeneration)
 */
app.post('/api/process-image-custom', async (req, res) => {
    try {
        const { imagePath, customPrompt } = req.body;
        if (!imagePath) {
            return res.status(400).json({ error: 'imagePath is required' });
        }
        if (!customPrompt) {
            return res.status(400).json({ error: 'customPrompt is required' });
        }

        console.log(`Regenerating single image with prompt: "${customPrompt.substring(0, 60)}..."`);
        const result = await processImageWithPrompt(imagePath, customPrompt);
        res.json({ success: true, result });
    } catch (error) {
        console.error('Custom image processing error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Generate title and description using Gemini AI (JSON → Template pipeline)
 */
app.post('/api/generate-content', async (req, res) => {
    try {
        const { productData, imageUrls } = req.body;
        if (!productData) {
            return res.status(400).json({ error: 'productData is required' });
        }

        console.log('Generating title and description JSON...');
        const [title, descriptionJSON] = await Promise.all([
            generateTitle(productData),
            generateDescriptionJSON(productData),
        ]);

        // Render JSON through the master HTML template
        const descriptionHtml = productTemplate(descriptionJSON, imageUrls || []);

        res.json({ success: true, title, descriptionJSON, descriptionHtml });
    } catch (error) {
        console.error('Content generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Regenerate description with a custom user prompt (JSON → Template pipeline)
 */
app.post('/api/regenerate-description', async (req, res) => {
    try {
        const { productData, customPrompt, imageUrls, existingJSON } = req.body;
        if (!productData) {
            return res.status(400).json({ error: 'productData is required' });
        }
        if (!customPrompt) {
            return res.status(400).json({ error: 'customPrompt is required' });
        }

        console.log(`Regenerating description with custom prompt: "${customPrompt.substring(0, 60)}..."`);
        const descriptionJSON = await generateDescriptionJSONWithPrompt(productData, customPrompt, existingJSON);

        // Render through template
        const descriptionHtml = productTemplate(descriptionJSON, imageUrls || []);

        res.json({ success: true, descriptionJSON, descriptionHtml });
    } catch (error) {
        console.error('Custom description generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Upload images to Shopify and create a product
 */
app.post('/api/create-product', async (req, res) => {
    try {
        const { title, bodyHtml, imagePaths, price, compareAtPrice, vendor, productType, tags, status, inventoryQuantity, descriptionJSON } = req.body;

        if (!title) return res.status(400).json({ error: 'title is required' });

        // Upload images to Shopify first
        const uploadedImageUrls = [];
        if (imagePaths && imagePaths.length > 0) {
            for (let i = 0; i < imagePaths.length; i++) {
                const filePath = imagePaths[i];
                const filename = `product_${Date.now()}_${i}.${filePath.split('.').pop()}`;
                try {
                    const uploaded = await uploadFile(filePath, filename);
                    uploadedImageUrls.push(uploaded.url);
                } catch (err) {
                    console.error(`Image upload failed: ${err.message}`);
                }
            }
        }

        // Re-render description with Shopify CDN image URLs (fixes broken images)
        let finalBodyHtml = bodyHtml || '';
        if (descriptionJSON && uploadedImageUrls.length > 0) {
            finalBodyHtml = productTemplate(descriptionJSON, uploadedImageUrls);
        }

        // Create the product
        const product = await createProduct({
            title,
            bodyHtml: finalBodyHtml,
            images: uploadedImageUrls,
            price: price || '0.00',
            compareAtPrice,
            vendor: vendor || '',
            productType: productType || '',
            tags: tags || '',
            status: status || 'draft',
            inventoryQuantity: inventoryQuantity || 100,
        });

        res.json({
            success: true,
            product: {
                id: product.id,
                title: product.title,
                handle: product.handle,
                status: product.status,
                adminUrl: `https://${process.env.SHOPIFY_STORE_URL}/admin/products/${product.id}`,
                images: product.images?.length || 0,
            },
        });
    } catch (error) {
        console.error('Product creation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Full pipeline - single URL (automate everything)
 */
app.post('/api/automate', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const result = await runSingle(url);
        res.json(result);
    } catch (error) {
        console.error('Automation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Batch mode - process multiple URLs
 */
app.post('/api/batch', async (req, res) => {
    try {
        const { urls } = req.body;
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ error: 'urls array is required' });
        }

        // Start batch processing in the background
        const job = require('./modules/pipeline').createJob(urls);

        // Run in background
        setImmediate(async () => {
            job.status = 'running';
            for (let i = 0; i < urls.length; i++) {
                await require('./modules/pipeline').processSingleProduct(urls[i], job, i);
                if (i < urls.length - 1) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
            job.status = 'completed';
        });

        res.json({
            success: true,
            jobId: job.id,
            totalProducts: urls.length,
            message: 'Batch job started. Use /api/progress/:jobId for real-time updates.',
        });
    } catch (error) {
        console.error('Batch error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * SSE endpoint for real-time progress updates
 */
app.get('/api/progress/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    // Send initial state
    res.write(`data: ${JSON.stringify({
        type: 'init',
        jobId: job.id,
        status: job.status,
        totalProducts: job.totalProducts,
        completedProducts: job.completedProducts,
        currentStep: job.currentStep,
        currentPercent: job.currentPercent,
    })}\n\n`);

    // Register listener for updates
    const listener = (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    job.listeners.add(listener);

    // Cleanup on disconnect
    req.on('close', () => {
        job.listeners.delete(listener);
    });
});

/**
 * Get job status
 */
app.get('/api/job/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
        id: job.id,
        status: job.status,
        totalProducts: job.totalProducts,
        completedProducts: job.completedProducts,
        currentStep: job.currentStep,
        currentPercent: job.currentPercent,
        results: job.results,
        errors: job.errors,
    });
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
    console.log(`\n🚀 Shopify Product Automator running at http://localhost:${PORT}`);
    console.log(`\n📋 Configuration Status:`);
    console.log(`   Shopify: ${process.env.SHOPIFY_STORE_URL ? '✅ ' + process.env.SHOPIFY_STORE_URL : '❌ Not configured'}`);
    console.log(`   Gemini:  ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`\n💡 Open http://localhost:${PORT} in your browser to get started\n`);
});
