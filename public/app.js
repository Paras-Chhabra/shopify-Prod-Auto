// ============================================================
// Shopify Product Automator — Frontend Application
// ============================================================

const state = {
    scrapedData: null,
    processedImages: [],
    generatedTitle: '',
    descriptionJSON: null,
    descriptionHtml: '',
};

// ---- DOM References ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
    connectionStatus: $('#connectionStatus'),
    userGreeting: $('#userGreeting'),
    urlInput: $('#urlInput'),
    fetchBtn: $('#fetchBtn'),
    customApiKey: $('#customApiKey'),
    logoutBtn: $('#logoutBtn'),
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
    ourBrandName: $('#ourBrandName'),
    finalPrice: $('#finalPrice'),
    finalCurrency: $('#finalCurrency'),
    productType: $('#productType'),
    productTags: $('#productTags'),
    productVendor: $('#productVendor'),
    productStatus: $('#productStatus'),
    productInventory: $('#productInventory'),
    createProductBtn: $('#createProductBtn'),
    progressSection: $('#progressSection'),
    progressFill: $('#progressFill'),
    progressStep: $('#progressStep'),
    resultsSection: $('#resultsSection'),
    resultContent: $('#resultContent'),
    toastContainer: $('#toastContainer'),
    dashboardGrid: $('#dashboardGrid'),
};

// ============================================================
// Initialization
// ============================================================

async function init() {
    // Load user greeting + connection status in parallel
    Promise.all([loadUserInfo(), checkConnection()]);

    // Load dashboard
    loadDashboard();

    // Event listeners
    els.fetchBtn.addEventListener('click', handleFetch);
    els.processImagesBtn.addEventListener('click', handleProcessImages);
    els.regenerateBtn.addEventListener('click', handleProcessImages);
    els.generateContentBtn.addEventListener('click', handleGenerateContent);
    els.createProductBtn.addEventListener('click', handleCreateProduct);

    if (els.logoutBtn) {
        els.logoutBtn.addEventListener('click', async () => {
            try { await fetch('/auth/logout', { method: 'POST' }); } catch (_) { }
            window.location.href = '/login.html';
        });
    }
}

async function loadUserInfo() {
    try {
        const res = await apiFetch('/api/me');
        if (!res) return;
        const data = await res.json();
        if (data.name && els.userGreeting) {
            els.userGreeting.textContent = `👋 ${data.name}`;
        }
    } catch (_) { }
}

async function checkConnection() {
    try {
        const res = await apiFetch('/api/test-connection');
        if (!res) return;
        const data = await res.json();
        const dot = els.connectionStatus.querySelector('.status-dot');
        const txt = els.connectionStatus.querySelector('.status-text');
        if (data.success) {
            dot.classList.add('connected');
            txt.textContent = `Connected · ${data.shopName}`;
        } else {
            dot.classList.add('error');
            txt.textContent = 'Connection failed';
        }
    } catch {
        const dot = els.connectionStatus.querySelector('.status-dot');
        const txt = els.connectionStatus.querySelector('.status-text');
        dot.classList.add('error');
        txt.textContent = 'Connection error';
    }
}

// ============================================================
// Global fetch wrapper — handle 401 globally
// ============================================================
async function apiFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401) {
        window.location.href = '/login.html';
        return null;
    }
    return res;
}

// ============================================================
// Dashboard — My Products
// ============================================================

async function loadDashboard() {
    const grid = els.dashboardGrid;
    grid.innerHTML = '<p class="empty-state" id="dashboardEmpty">Loading your products...</p>';

    try {
        const res = await apiFetch('/api/my-products-with-orders');
        if (!res) return;
        const data = await res.json();

        if (!data.success) throw new Error(data.error);

        if (data.products.length === 0) {
            grid.innerHTML = '<p class="empty-state">No products yet. Add your first product below! 👇</p>';
            return;
        }

        grid.innerHTML = '';
        data.products.forEach(p => {
            const card = document.createElement('div');
            card.style.cssText = `
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 12px;
                padding: 14px 18px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                transition: border-color 0.2s;
            `;
            card.addEventListener('mouseenter', () => card.style.borderColor = 'rgba(124,58,237,0.4)');
            card.addEventListener('mouseleave', () => card.style.borderColor = 'rgba(255,255,255,0.08)');

            const orderDisplay = p.totalOrders === null
                ? `<span style="font-size:12px;color:rgba(255,255,255,0.3);font-style:italic;">unavailable</span>`
                : `<span style="font-size:14px;font-weight:700;color:#a78bfa;">${p.totalOrders}</span>`;

            card.innerHTML = `
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.title}</div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
                    <span style="font-size:11px;color:rgba(255,255,255,0.4);">Orders:</span>
                    ${orderDisplay}
                </div>
                <a href="${p.adminUrl}" target="_blank"
                    style="font-size:12px;color:#7c3aed;text-decoration:none;font-weight:600;white-space:nowrap;">Open in Shopify →</a>
            `;
            grid.appendChild(card);
        });
    } catch (err) {
        grid.innerHTML = `<p class="empty-state">Failed to load products: ${err.message}</p>`;
    }
}

// ============================================================
// Fetch Product
// ============================================================

async function handleFetch() {
    const url = els.urlInput.value.trim();
    if (!url) { showToast('Please enter a product URL', 'warning'); return; }

    setButtonLoading(els.fetchBtn, true);
    state.processedImages = [];

    try {
        const res = await apiFetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        if (!res) return;
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        state.scrapedData = data.data;
        renderPreview(data.data);
        showToast('Product data fetched!', 'success');
    } catch (err) {
        showToast(`Scraping failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(els.fetchBtn, false);
    }
}

function renderPreview(data) {
    els.previewSection.classList.remove('hidden');
    els.productTitle.value = data.title || '';
    els.productDescription.value = data.description || '';
    els.productPrice.value = data.price || '';
    els.productCurrency.value = data.currency || 'INR';
    els.productBrand.value = data.brand || 'Unknown';

    // Show upload section immediately — AI processing is optional
    els.uploadSection.classList.remove('hidden');
    els.finalTitle.value = data.title || '';
    els.finalPrice.value = data.price || '';
    els.finalCurrency.value = data.currency || 'INR';

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
                if (data.images && data.images.length > index) data.images.splice(index, 1);
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
            imgEl.src = url; imgEl.alt = 'Product image'; imgEl.loading = 'lazy';
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn'; deleteBtn.innerHTML = '✕';
            deleteBtn.onclick = () => { data.images.splice(index, 1); renderPreview(data); };
            wrapper.appendChild(imgEl); wrapper.appendChild(deleteBtn);
            els.originalImages.appendChild(wrapper);
        });
    } else {
        els.originalImages.innerHTML = '<p class="empty-state">No images found</p>';
    }

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
        const imagePaths = state.scrapedData.localImages.map(img => img.localPath);
        const customApiKey = els.customApiKey.value.trim();
        const brand = els.productBrand.value.trim();
        const ourBrand = els.ourBrandName.value.trim(); // empty = no brand overlay

        const res = await apiFetch('/api/process-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagePaths, customApiKey, brand, ourBrand }),
        });
        if (!res) return;
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        state.processedImages = data.results;
        renderProcessedImages(data.results);

        // Keep current form values — user may have already edited them

        showToast(`${data.results.length} images processed!`, 'success');
    } catch (err) {
        showToast(`Image processing failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(els.processImagesBtn, false);
        hideProgress();
    }
}

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

function removeProcessedImage(index) {
    state.processedImages.splice(index, 1);
    renderProcessedImages(state.processedImages);
}

async function handlePerImageRegenerate(index) {
    const promptInput = document.getElementById(`prompt-${index}`);
    const customPrompt = promptInput.value.trim();
    if (!customPrompt) { showToast('Please enter a prompt for this image', 'warning'); promptInput.focus(); return; }

    const card = document.getElementById(`processed-card-${index}`);
    const btn = card.querySelector('.btn');
    setButtonLoading(btn, true);

    try {
        const imagePath = state.processedImages[index].processedPath;
        const customApiKey = els.customApiKey.value.trim();

        const res = await apiFetch('/api/process-image-custom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagePath, customPrompt, customApiKey }),
        });
        if (!res) return;
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        state.processedImages[index] = data.result;
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
// Generate Content
// ============================================================

async function handleGenerateContent() {
    if (!state.scrapedData) { showToast('Please fetch a product first', 'warning'); return; }
    setButtonLoading(els.generateContentBtn, true);

    try {
        const imageUrls = getProcessedImageUrls();
        const customApiKey = els.customApiKey.value.trim();
        // Use whatever title the user has typed, falling back to scraped title
        const currentTitle = els.finalTitle.value.trim() || state.scrapedData.title;

        const res = await apiFetch('/api/generate-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productData: {
                    title: currentTitle,
                    description: state.scrapedData.description,
                    brand: state.scrapedData.brand,
                    price: els.finalPrice.value || state.scrapedData.price,
                    currency: els.finalCurrency.value || state.scrapedData.currency,
                },
                imageUrls,
                customApiKey,
            }),
        });
        if (!res) return;
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        state.generatedTitle = data.title;
        state.descriptionJSON = data.descriptionJSON;
        state.descriptionHtml = data.descriptionHtml;
        // Only update title field if user hasn't edited it yet
        if (!els.finalTitle.value.trim() || els.finalTitle.value.trim() === state.scrapedData.title) {
            els.finalTitle.value = data.title;
        }
        updatePreviewIframe(els.descriptionPreview, data.descriptionHtml);
        showToast('Description generated!', 'success');
    } catch (err) {
        showToast(`Content generation failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(els.generateContentBtn, false);
    }
}



// ============================================================
// Create Product
// ============================================================

async function handleCreateProduct() {
    const title = els.finalTitle.value.trim();
    if (!title) { showToast('Please set a product title', 'warning'); return; }

    setButtonLoading(els.createProductBtn, true);
    showProgress('Creating product on Shopify...', 0);

    try {
        const imagePaths = state.processedImages.length > 0
            ? state.processedImages.map(img => img.processedPath)
            : state.scrapedData?.localImages?.map(img => img.localPath) || [];

        showProgress('Uploading images...', 20);

        const res = await apiFetch('/api/create-product', {
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
        if (!res) return;

        showProgress('Finalizing...', 80);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

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

        showToast('Product created on Shopify!', 'success');

        // Refresh dashboard to show the new product
        loadDashboard();
    } catch (err) {
        showToast(`Product creation failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(els.createProductBtn, false);
        hideProgress();
    }
}

// ============================================================
// Helpers
// ============================================================

function getProcessedImageUrls() {
    // Use AI-processed images if available
    if (state.processedImages.length > 0) {
        return state.processedImages.map(img => {
            const relativePath = img.processedPath.split('/temp/')[1] || img.processedPath;
            return `/temp/${relativePath}`;
        });
    }
    // Fall back to original scraped images (when AI processing was skipped)
    if (state.scrapedData?.localImages?.length > 0) {
        return state.scrapedData.localImages.map(img => {
            const relativePath = img.localPath.split('/temp/')[1] || img.localPath;
            return `/temp/${relativePath}`;
        });
    }
    return [];
}

function updatePreviewIframe(iframe, html) {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html>
    <html><head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>body { margin:0; padding:20px; font-family:'Inter',system-ui,sans-serif; background:#fff; } img { max-width:100%; height:auto; }</style>
    </head><body>${html}</body></html>`);
    doc.close();
    setTimeout(() => {
        try {
            const height = doc.documentElement.scrollHeight;
            iframe.style.height = Math.max(400, height + 40) + 'px';
        } catch (_) { }
    }, 200);
}

function setButtonLoading(btn, loading) {
    const textEl = btn.querySelector('.btn-text');
    const loaderEl = btn.querySelector('.btn-loader');
    btn.disabled = loading;
    if (textEl) textEl.style.opacity = loading ? '0.5' : '1';
    if (loaderEl) loaderEl.classList.toggle('hidden', !loading);
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

// Make functions accessible from inline onclick handlers
window.removeProcessedImage = removeProcessedImage;
window.handlePerImageRegenerate = handlePerImageRegenerate;

// ============================================================
// Start
// ============================================================
document.addEventListener('DOMContentLoaded', init);
