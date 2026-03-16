// ============================================================
// Shopify Product Automator — Frontend Application
// ============================================================

const state = {
    mode: 'single', // 'single' or 'batch'
    scrapedData: null,
    processedImages: [],
    generatedTitle: '',
    descriptionJSON: null,
    descriptionHtml: '',
    currentJobId: null,
    history: JSON.parse(localStorage.getItem('productHistory') || '[]'),
};

// ---- DOM References ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
    connectionStatus: $('#connectionStatus'),
    singleModeBtn: $('#singleModeBtn'),
    batchModeBtn: $('#batchModeBtn'),
    urlInput: $('#urlInput'),
    urlSubtitle: $('#urlSubtitle'),
    fetchBtn: $('#fetchBtn'),
    previewSection: $('#previewSection'),
    originalImages: $('#originalImages'),
    productTitle: $('#productTitle'),
    productDescription: $('#productDescription'),
    productPrice: $('#productPrice'),
    productCurrency: $('#productCurrency'),
    productBrand: $('#productBrand'),
    processImagesBtn: $('#processImagesBtn'),
    regenerateBtn: $('#regenerateBtn'),
    generateContentBtn: $('#generateContentBtn'),
    comparisonSection: $('#comparisonSection'),
    processedImagesGrid: $('#processedImagesGrid'),
    uploadSection: $('#uploadSection'),
    finalTitle: $('#finalTitle'),
    descriptionPreview: $('#descriptionPreview'),
    customDescPrompt: $('#customDescPrompt'),
    customDescBtn: $('#customDescBtn'),
    finalPrice: $('#finalPrice'),
    finalCurrency: $('#finalCurrency'),
    productType: $('#productType'),
    productTags: $('#productTags'),
    productVendor: $('#productVendor'),
    productStatus: $('#productStatus'),
    productInventory: $('#productInventory'),
    createProductBtn: $('#createProductBtn'),
    batchSection: $('#batchSection'),
    batchSubtitle: $('#batchSubtitle'),
    batchProgressFill: $('#batchProgressFill'),
    batchProgressText: $('#batchProgressText'),
    batchList: $('#batchList'),
    progressSection: $('#progressSection'),
    progressFill: $('#progressFill'),
    progressStep: $('#progressStep'),
    resultsSection: $('#resultsSection'),
    resultContent: $('#resultContent'),
    historyList: $('#historyList'),
    toastContainer: $('#toastContainer'),
};

// ============================================================
// Initialization
// ============================================================

async function init() {
    // Check connection
    try {
        const res = await fetch('/api/test-connection');
        const data = await res.json();

        const statusDot = els.connectionStatus.querySelector('.status-dot');
        const statusText = els.connectionStatus.querySelector('.status-text');

        if (data.success) {
            statusDot.classList.add('connected');
            statusText.textContent = `Connected · ${data.shopName}`;
        } else {
            statusDot.classList.add('error');
            statusText.textContent = 'Connection failed';
        }
    } catch {
        const statusDot = els.connectionStatus.querySelector('.status-dot');
        const statusText = els.connectionStatus.querySelector('.status-text');
        statusDot.classList.add('error');
        statusText.textContent = 'Connection error';
    }

    // Event listeners
    els.singleModeBtn.addEventListener('click', () => setMode('single'));
    els.batchModeBtn.addEventListener('click', () => setMode('batch'));
    els.fetchBtn.addEventListener('click', handleFetch);

    // Process images
    els.processImagesBtn.addEventListener('click', handleProcessImages);
    els.regenerateBtn.addEventListener('click', handleProcessImages);

    // Generate content
    els.generateContentBtn.addEventListener('click', handleGenerateContent);

    // Create product
    els.createProductBtn.addEventListener('click', handleCreateProduct);

    // Custom description regeneration
    els.customDescBtn.addEventListener('click', handleCustomDescRegenerate);

    // Auto-resize textarea
    els.urlInput.addEventListener('input', () => {
        if (state.mode === 'batch') {
            els.urlInput.style.height = 'auto';
            els.urlInput.style.height = els.urlInput.scrollHeight + 'px';
        }
    });

    // Render history
    renderHistory();
}

// ============================================================
// Mode Toggle
// ============================================================

function setMode(mode) {
    state.mode = mode;

    if (mode === 'single') {
        els.singleModeBtn.classList.add('active');
        els.batchModeBtn.classList.remove('active');
        els.urlInput.rows = 1;
        els.urlInput.placeholder = 'https://example.com/product/awesome-item';
        els.urlSubtitle.textContent = 'Paste a reference product URL to get started';
    } else {
        els.batchModeBtn.classList.add('active');
        els.singleModeBtn.classList.remove('active');
        els.urlInput.rows = 5;
        els.urlInput.placeholder = 'Paste one URL per line:\nhttps://example.com/product/1\nhttps://example.com/product/2\nhttps://example.com/product/3';
        els.urlSubtitle.textContent = 'Paste multiple URLs (one per line) for batch processing';
    }
}

// ============================================================
// Single Mode — Fetch
// ============================================================

async function handleFetch() {
    const input = els.urlInput.value.trim();
    if (!input) {
        showToast('Please enter a product URL', 'warning');
        return;
    }

    if (state.mode === 'batch') {
        return handleBatch(input);
    }

    setButtonLoading(els.fetchBtn, true);
    state.processedImages = [];

    try {
        const res = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: input }),
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        state.scrapedData = data.data;
        renderPreview(data.data);
        showToast('Product data fetched successfully!', 'success');
    } catch (err) {
        showToast(`Scraping failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(els.fetchBtn, false);
    }
}

function renderPreview(data) {
    // Show preview section
    els.previewSection.classList.remove('hidden');

    // Fill in fields
    els.productTitle.value = data.title || '';
    els.productDescription.value = data.description || '';
    els.productPrice.value = data.price || '';
    els.productCurrency.value = data.currency || 'INR';
    els.productBrand.value = data.brand || 'Unknown';

    // Render images with delete buttons
    els.originalImages.innerHTML = '';
    if (data.localImages && data.localImages.length > 0) {
        data.localImages.forEach((img, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'image-wrapper';

            const imgEl = document.createElement('img');
            const relativePath = img.localPath.split('/temp/')[1];
            imgEl.src = `/temp/${relativePath}`;
            imgEl.alt = 'Product image';
            imgEl.loading = 'lazy';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '✕';
            deleteBtn.title = 'Remove this image';
            deleteBtn.onclick = () => {
                data.localImages.splice(index, 1);
                if (data.images && data.images.length > index) {
                    data.images.splice(index, 1);
                }
                renderPreview(data);
            };

            wrapper.appendChild(imgEl);
            wrapper.appendChild(deleteBtn);
            els.originalImages.appendChild(wrapper);
        });
    } else if (data.images && data.images.length > 0) {
        data.images.forEach((url, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'image-wrapper';

            const imgEl = document.createElement('img');
            imgEl.src = url;
            imgEl.alt = 'Product image';
            imgEl.loading = 'lazy';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '✕';
            deleteBtn.title = 'Remove this image';
            deleteBtn.onclick = () => {
                data.images.splice(index, 1);
                renderPreview(data);
            };

            wrapper.appendChild(imgEl);
            wrapper.appendChild(deleteBtn);
            els.originalImages.appendChild(wrapper);
        });
    } else {
        els.originalImages.innerHTML = '<p class="empty-state">No images found</p>';
    }

    // Scroll to preview
    els.previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// Image Processing
// ============================================================

async function handleProcessImages() {
    if (!state.scrapedData?.localImages?.length) {
        showToast('No images available to process', 'warning');
        return;
    }

    setButtonLoading(els.processImagesBtn, true);
    showProgress('Processing images with AI...', 0);

    try {
        const imagePaths = state.scrapedData.localImages.map((img) => img.localPath);

        const res = await fetch('/api/process-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagePaths }),
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        state.processedImages = data.results;
        renderProcessedImages(data.results);

        // Show upload section
        els.uploadSection.classList.remove('hidden');
        els.finalTitle.value = state.scrapedData.title || '';
        els.finalPrice.value = state.scrapedData.price || '';
        els.finalCurrency.value = state.scrapedData.currency || 'INR';

        showToast(`${data.results.length} images processed!`, 'success');
    } catch (err) {
        showToast(`Image processing failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(els.processImagesBtn, false);
        hideProgress();
    }
}

/**
 * Render processed images — each with its own "Regenerate with Custom Prompt" button
 */
function renderProcessedImages(results) {
    els.comparisonSection.classList.remove('hidden');
    els.processedImagesGrid.innerHTML = '';

    results.forEach((result, index) => {
        const card = document.createElement('div');
        card.className = 'processed-image-card';
        card.id = `processed-card-${index}`;

        const relativePath = result.processedPath.split('/temp/')[1] || result.processedPath;
        const imgSrc = `/temp/${relativePath}`;

        card.innerHTML = `
            <div class="processed-image-wrapper">
                <img src="${imgSrc}" alt="Processed image ${index + 1}" loading="lazy" />
                <button class="delete-btn" title="Remove this image" onclick="removeProcessedImage(${index})">✕</button>
            </div>
            <div class="per-image-regen">
                <input type="text" class="form-input per-image-prompt" id="prompt-${index}"
                    placeholder="e.g. Remove the green tag, make background white..." />
                <button class="btn btn-secondary btn-sm" onclick="handlePerImageRegenerate(${index})">
                    <span class="btn-icon">🎨</span>
                    <span class="btn-text">Regenerate</span>
                    <span class="btn-loader hidden"></span>
                </button>
            </div>
        `;

        els.processedImagesGrid.appendChild(card);
    });
}

/**
 * Remove a processed image
 */
function removeProcessedImage(index) {
    state.processedImages.splice(index, 1);
    renderProcessedImages(state.processedImages);
}

/**
 * Regenerate a single image with a custom prompt
 */
async function handlePerImageRegenerate(index) {
    const promptInput = document.getElementById(`prompt-${index}`);
    const customPrompt = promptInput.value.trim();
    if (!customPrompt) {
        showToast('Please enter a prompt for this image', 'warning');
        promptInput.focus();
        return;
    }

    const card = document.getElementById(`processed-card-${index}`);
    const btn = card.querySelector('.btn');
    setButtonLoading(btn, true);

    try {
        // Use the current processed image path for regeneration
        const imagePath = state.processedImages[index].processedPath;

        const res = await fetch('/api/process-image-custom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagePath, customPrompt }),
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // Update the specific image in state
        state.processedImages[index] = data.result;

        // Update just that image in the DOM
        const img = card.querySelector('img');
        const newRelativePath = data.result.processedPath.split('/temp/')[1] || data.result.processedPath;
        img.src = `/temp/${newRelativePath}?t=${Date.now()}`;

        showToast(`Image ${index + 1} regenerated!`, 'success');
    } catch (err) {
        showToast(`Regeneration failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}

// ============================================================
// Generate Title & Description
// ============================================================

async function handleGenerateContent() {
    if (!state.scrapedData) {
        showToast('Please fetch a product first', 'warning');
        return;
    }

    setButtonLoading(els.generateContentBtn, true);

    try {
        // Collect image URLs for description template
        const imageUrls = getProcessedImageUrls();

        const res = await fetch('/api/generate-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productData: {
                    title: state.scrapedData.title,
                    description: state.scrapedData.description,
                    brand: state.scrapedData.brand,
                    price: state.scrapedData.price,
                    currency: state.scrapedData.currency,
                },
                imageUrls,
            }),
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        state.generatedTitle = data.title;
        state.descriptionJSON = data.descriptionJSON;
        state.descriptionHtml = data.descriptionHtml;

        els.finalTitle.value = data.title;
        updatePreviewIframe(data.descriptionHtml);

        showToast('Title and description generated!', 'success');
    } catch (err) {
        showToast(`Content generation failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(els.generateContentBtn, false);
    }
}

async function handleCustomDescRegenerate() {
    const customPrompt = els.customDescPrompt.value.trim();
    if (!customPrompt) {
        showToast('Please enter your description instructions', 'warning');
        els.customDescPrompt.focus();
        return;
    }

    setButtonLoading(els.customDescBtn, true);

    try {
        const imageUrls = getProcessedImageUrls();

        const res = await fetch('/api/regenerate-description', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productData: {
                    title: els.finalTitle.value || els.productTitle.value || state.scrapedData?.title,
                    description: state.descriptionHtml || els.productDescription.value || state.scrapedData?.description,
                    brand: state.scrapedData?.brand,
                    price: els.finalPrice.value || els.productPrice.value || state.scrapedData?.price,
                    currency: els.finalCurrency.value || els.productCurrency.value || state.scrapedData?.currency,
                },
                customPrompt,
                imageUrls,
                existingJSON: state.descriptionJSON,
            }),
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        state.descriptionJSON = data.descriptionJSON;
        state.descriptionHtml = data.descriptionHtml;
        updatePreviewIframe(data.descriptionHtml);
        showToast('Description regenerated with your instructions!', 'success');
    } catch (err) {
        showToast(`Description regeneration failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(els.customDescBtn, false);
    }
}

// ============================================================
// Create Product on Shopify
// ============================================================

async function handleCreateProduct() {
    const title = els.finalTitle.value.trim();
    if (!title) {
        showToast('Please set a product title', 'warning');
        return;
    }

    setButtonLoading(els.createProductBtn, true);
    showProgress('Creating product on Shopify...', 0);

    try {
        const imagePaths = state.processedImages.length > 0
            ? state.processedImages.map((img) => img.processedPath)
            : state.scrapedData?.localImages?.map((img) => img.localPath) || [];

        showProgress('Uploading images...', 20);

        const res = await fetch('/api/create-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                bodyHtml: state.descriptionHtml || '',
                descriptionJSON: state.descriptionJSON || null,
                imagePaths,
                price: els.finalPrice.value || '0.00',
                vendor: els.productVendor.value || '',
                productType: els.productType.value || '',
                tags: els.productTags.value || '',
                status: els.productStatus.value || 'draft',
                inventoryQuantity: parseInt(els.productInventory.value) || 100,
            }),
        });

        showProgress('Finalizing...', 80);

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // Show result
        els.resultsSection.classList.remove('hidden');
        els.resultContent.innerHTML = `
            <div class="result-item">
                <span>✅</span>
                <div>
                    <strong>${data.product.title}</strong><br>
                    <span style="color:var(--text-muted);">ID: ${data.product.id} · Status: ${data.product.status} · ${data.product.images} images</span>
                </div>
                <a href="${data.product.adminUrl}" target="_blank">Open in Shopify →</a>
            </div>
        `;

        addToHistory(data.product);
        showToast('Product created on Shopify!', 'success');
    } catch (err) {
        showToast(`Product creation failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(els.createProductBtn, false);
        hideProgress();
    }
}

// ============================================================
// Batch Mode
// ============================================================

async function handleBatch(input) {
    const urls = input
        .split('\n')
        .map((u) => u.trim())
        .filter((u) => u.startsWith('http'));
    if (urls.length === 0) {
        showToast('No valid URLs found', 'warning');
        return;
    }

    setButtonLoading(els.fetchBtn, true);
    els.batchSection.classList.remove('hidden');
    els.batchSubtitle.textContent = `Processing ${urls.length} products...`;
    els.batchProgressFill.style.width = '0%';
    els.batchProgressText.textContent = '0%';

    // Render batch items
    els.batchList.innerHTML = urls
        .map(
            (url, idx) => `
        <div class="batch-item" id="batch-item-${idx}">
            <span class="batch-item-status">⏳</span>
            <span class="batch-item-url">${url}</span>
            <span class="batch-item-step">Pending</span>
        </div>
    `
        )
        .join('');

    // Start batch
    try {
        const res = await fetch('/api/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls }),
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        state.currentJobId = data.jobId;
        listenToProgress(data.jobId, urls);
    } catch (err) {
        showToast(`Batch failed: ${err.message}`, 'error');
        setButtonLoading(els.fetchBtn, false);
    }
}

function listenToProgress(jobId, urls) {
    const eventSource = new EventSource(`/api/progress/${jobId}`);

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'progress') {
            els.batchProgressFill.style.width = `${data.currentPercent}%`;
            els.batchProgressText.textContent = `${data.currentPercent}%`;
            els.batchSubtitle.textContent = `${data.currentStep} (${data.completedProducts}/${data.totalProducts})`;

            // Update current item
            for (let i = 0; i < data.completedProducts; i++) {
                updateBatchItem(i, 'completed', 'Done ✓');
            }
        }

        if (data.type === 'completed') {
            eventSource.close();
            setButtonLoading(els.fetchBtn, false);

            els.batchProgressFill.style.width = '100%';
            els.batchProgressText.textContent = '100%';
            els.batchSubtitle.textContent = `Completed! ${data.totalSuccess || 0} succeeded, ${data.totalFailed || 0} failed`;

            // Mark all items
            if (data.results) {
                data.results.forEach((result, idx) => {
                    if (result.success) {
                        updateBatchItem(idx, 'completed', 'Done ✓');
                        addToHistory(result.shopifyProduct);
                    } else {
                        updateBatchItem(idx, 'failed', result.error || 'Failed');
                    }
                });
            }

            // Show results
            renderBatchResults(data.results || [], data.errors || []);
            showToast(`Batch complete! ${data.totalSuccess || 0} products created.`, 'success');
        }
    };

    eventSource.onerror = () => {
        eventSource.close();
        pollJobStatus(jobId);
    };
}

async function pollJobStatus(jobId) {
    const poll = async () => {
        try {
            const res = await fetch(`/api/job/${jobId}`);
            const data = await res.json();

            els.batchProgressFill.style.width = `${data.currentPercent}%`;
            els.batchProgressText.textContent = `${data.currentPercent}%`;

            if (data.status === 'completed') {
                setButtonLoading(els.fetchBtn, false);
                els.batchSubtitle.textContent = `Completed!`;
                renderBatchResults(data.results, data.errors);
                showToast('Batch processing complete!', 'success');
                return;
            }

            setTimeout(poll, 2000);
        } catch (e) {
            setTimeout(poll, 3000);
        }
    };
    poll();
}

function updateBatchItem(idx, status, step) {
    const item = document.getElementById(`batch-item-${idx}`);
    if (!item) return;

    item.className = `batch-item ${status}`;

    const statusEl = item.querySelector('.batch-item-status');
    const stepEl = item.querySelector('.batch-item-step');

    if (status === 'active') {
        statusEl.textContent = '⏳';
    } else if (status === 'completed') {
        statusEl.textContent = '✅';
    } else if (status === 'failed') {
        statusEl.textContent = '❌';
    }

    stepEl.textContent = step;
}

function renderBatchResults(results, errors) {
    els.resultsSection.classList.remove('hidden');
    els.resultContent.innerHTML = '';

    results.forEach((result) => {
        if (result.success) {
            const item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = `
        <span>✅</span>
        <div>
          <strong>${result.shopifyProduct?.title || 'Product'}</strong><br>
          <span style="color:var(--text-muted);">From: ${result.sourceUrl}</span>
        </div>
        <a href="${result.shopifyProduct?.adminUrl}" target="_blank">View →</a>
      `;
            els.resultContent.appendChild(item);
        }
    });

    errors.forEach((err) => {
        const item = document.createElement('div');
        item.className = 'result-item error';
        item.innerHTML = `
      <span>❌</span>
      <div>
        <strong>Failed</strong><br>
        <span style="color:var(--text-muted);">${err.sourceUrl}: ${err.error}</span>
      </div>
    `;
        els.resultContent.appendChild(item);
    });
}

// ============================================================
// History
// ============================================================

function addToHistory(product) {
    const entry = {
        title: product.title,
        adminUrl: product.adminUrl,
        status: product.status,
        createdAt: new Date().toISOString(),
    };

    state.history.unshift(entry);
    if (state.history.length > 20) state.history = state.history.slice(0, 20);
    localStorage.setItem('productHistory', JSON.stringify(state.history));
    renderHistory();
}

function renderHistory() {
    if (state.history.length === 0) {
        els.historyList.innerHTML = '<p class="empty-state">No products added yet. Start by pasting a product URL above!</p>';
        return;
    }

    els.historyList.innerHTML = state.history
        .map(
            (item) => `
    <div class="history-item">
      <div>
        <div class="history-item-title">${item.title}</div>
        <div class="history-item-meta">${new Date(item.createdAt).toLocaleString()} · ${item.status}</div>
      </div>
      <a href="${item.adminUrl}" target="_blank">Open in Shopify →</a>
    </div>
  `
        )
        .join('');
}

// ============================================================
// Helper Functions
// ============================================================

function getProcessedImageUrls() {
    const urls = [];
    if (state.processedImages.length > 0) {
        state.processedImages.forEach((img) => {
            const relativePath = img.processedPath.split('/temp/')[1] || img.processedPath;
            urls.push(`/temp/${relativePath}`);
        });
    }
    return urls;
}

function updatePreviewIframe(html) {
    const iframe = els.descriptionPreview;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            body { margin: 0; padding: 20px; font-family: 'Inter', system-ui, sans-serif; background: #fff; }
            img { max-width: 100%; height: auto; }
        </style>
    </head>
    <body>${html}</body>
    </html>`);
    doc.close();

    // Auto-resize iframe to fit content
    setTimeout(() => {
        try {
            const height = doc.documentElement.scrollHeight;
            iframe.style.height = Math.max(400, height + 40) + 'px';
        } catch (e) { /* cross-origin guard */ }
    }, 200);
}

// ============================================================
// UI Helpers
// ============================================================

function setButtonLoading(btn, loading) {
    const textEl = btn.querySelector('.btn-text');
    const loaderEl = btn.querySelector('.btn-loader');

    if (loading) {
        btn.disabled = true;
        if (textEl) textEl.style.opacity = '0.5';
        if (loaderEl) loaderEl.classList.remove('hidden');
    } else {
        btn.disabled = false;
        if (textEl) textEl.style.opacity = '1';
        if (loaderEl) loaderEl.classList.add('hidden');
    }
}

function showProgress(step, percent) {
    els.progressSection.classList.remove('hidden');
    els.progressFill.style.width = `${percent}%`;
    els.progressStep.textContent = step;
}

function hideProgress() {
    els.progressSection.classList.add('hidden');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;

    els.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================================
// Start
// ============================================================
document.addEventListener('DOMContentLoaded', init);
