const { scrapeProduct } = require('./scraper');
const { processImages, generateDescriptionJSON, generateTitle } = require('./gemini');
const { uploadFile, createProduct } = require('./shopify');
const { v4: uuidv4 } = require('uuid');

const jobs = new Map();

function createJob(urls) {
    const jobId = uuidv4();
    const job = {
        id: jobId,
        status: 'pending',
        urls: urls,
        totalProducts: urls.length,
        completedProducts: 0,
        currentProductIndex: -1,
        currentStep: '',
        currentPercent: 0,
        results: [],
        errors: [],
        createdAt: new Date().toISOString(),
        listeners: new Set(),
    };
    jobs.set(jobId, job);
    return job;
}

function getJob(jobId) {
    return jobs.get(jobId);
}

function emitProgress(job, data) {
    const event = {
        jobId: job.id,
        ...data,
        timestamp: Date.now(),
    };

    for (const listener of job.listeners) {
        try {
            listener(event);
        } catch (e) {
            job.listeners.delete(listener);
        }
    }
}

async function processSingleProduct(url, job, productIndex, customApiKey = null) {
    const totalProducts = job ? job.totalProducts : 1;
    const basePercent = job ? (productIndex / totalProducts) * 100 : 0;
    const productWeight = 100 / totalProducts;

    const updateProgress = (step, stepPercent) => {
        const overallPercent = basePercent + (stepPercent / 100) * productWeight;
        if (job) {
            job.currentStep = step;
            job.currentPercent = Math.round(overallPercent);
            job.currentProductIndex = productIndex;
            emitProgress(job, {
                type: 'progress',
                currentProduct: productIndex + 1,
                totalProducts,
                step,
                stepPercent,
                overallPercent: Math.round(overallPercent),
                url,
            });
        }
    };

    try {
        updateProgress('Scraping product data...', 0);
        const scrapedData = await scrapeProduct(url);
        updateProgress('Product data scraped', 25);

        if (!scrapedData.title) {
            throw new Error('Could not extract product title from the page');
        }

        updateProgress('Processing images with AI...', 25);
        let processedImages = [];
        if (scrapedData.localImages && scrapedData.localImages.length > 0) {
            const imagePaths = scrapedData.localImages.map(img => img.localPath);
            processedImages = await processImages(imagePaths, customApiKey);
            updateProgress('Images processed', 55);
        } else {
            updateProgress('No images to process', 55);
        }

        updateProgress('Generating product description...', 55);
        const [newTitle, newDescriptionJSON] = await Promise.all([
            generateTitle(scrapedData, customApiKey),
            generateDescriptionJSON(scrapedData, customApiKey),
        ]);

        // IMPORTANT: pipeline.js previously passed newDescription directly to bodyHtml. 
        // We need to render the template. Since pipeline is headless, it should use the template.
        const { productTemplate } = require('../templates/productDescriptionTemplate');
        updateProgress('Description generated', 65);

        updateProgress('Uploading images to Shopify...', 65);
        const uploadedImages = [];
        for (let i = 0; i < processedImages.length; i++) {
            const img = processedImages[i];
            const filePath = img.processedPath;
            const filename = `product_${Date.now()}_${i}.${filePath.split('.').pop()}`;
            try {
                const uploaded = await uploadFile(filePath, filename);
                uploadedImages.push(uploaded.url);
                updateProgress(`Uploaded image ${i + 1}/${processedImages.length}`, 65 + ((i + 1) / processedImages.length) * 20);
            } catch (err) {
                console.error(`Failed to upload image ${i}: ${err.message}`);
                if (scrapedData.localImages[i]?.originalUrl) {
                    uploadedImages.push(scrapedData.localImages[i].originalUrl);
                }
            }
        }

        const finalBodyHtml = productTemplate(newDescriptionJSON, uploadedImages);

        updateProgress('Creating product on Shopify...', 85);
        const product = await createProduct({
            title: newTitle,
            bodyHtml: finalBodyHtml,
            images: uploadedImages,
            price: scrapedData.price || '0.00',
            vendor: '',
            productType: '',
            tags: '',
            status: 'draft',
        });

        updateProgress('Product created!', 100);

        const result = {
            success: true,
            sourceUrl: url,
            shopifyProduct: {
                id: product.id,
                title: product.title,
                handle: product.handle,
                status: product.status,
                adminUrl: `https://${process.env.SHOPIFY_STORE_URL}/admin/products/${product.id}`,
            },
            scrapedData: {
                originalTitle: scrapedData.title,
                newTitle: newTitle,
                imagesCount: uploadedImages.length,
                price: scrapedData.price,
            },
        };

        if (job) {
            job.completedProducts++;
            job.results.push(result);
        }

        return result;
    } catch (error) {
        const errorResult = {
            success: false,
            sourceUrl: url,
            error: error.message,
        };

        if (job) {
            job.errors.push(errorResult);
            job.completedProducts++;
        }

        updateProgress(`Error: ${error.message}`, 100);
        return errorResult;
    }
}

async function runSingle(url, customApiKey = null) {
    const job = createJob([url]);
    job.status = 'running';

    emitProgress(job, { type: 'started', mode: 'single' });

    const result = await processSingleProduct(url, job, 0, customApiKey);

    job.status = 'completed';
    emitProgress(job, { type: 'completed', results: [result] });

    return { jobId: job.id, ...result };
}

async function runBatch(urls, customApiKey = null) {
    const job = createJob(urls);
    job.status = 'running';

    emitProgress(job, { type: 'started', mode: 'batch', totalProducts: urls.length });

    for (let i = 0; i < urls.length; i++) {
        await processSingleProduct(urls[i], job, i, customApiKey);
        if (i < urls.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    job.status = 'completed';
    emitProgress(job, {
        type: 'completed',
        results: job.results,
        errors: job.errors,
        totalSuccess: job.results.filter(r => r.success).length,
        totalFailed: job.errors.length,
    });

    return {
        jobId: job.id,
        totalProducts: urls.length,
        successful: job.results.filter(r => r.success).length,
        failed: job.errors.length,
        results: job.results,
        errors: job.errors,
    };
}

module.exports = {
    createJob,
    getJob,
    runSingle,
    runBatch,
    processSingleProduct,
};
