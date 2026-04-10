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
    finalCompareAtPrice: $('#finalCompareAtPrice'),
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
    dashboardTableContainer: $('#dashboardTableContainer'),
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
    const grid = $('#dashboardTableContainer');
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

        const table = document.createElement('table');
        table.className = 'dashboard-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th style="width: 50%;">Product Title</th>
                    <th style="width: 25%;">Product ID</th>
                    <th style="width: 15%;">Orders</th>
                    <th style="width: 10%;">Action</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');

        data.products.forEach(p => {
            const tr = document.createElement('tr');

            const orderDisplay = p.totalOrders === null
                ? `<span style="color:rgba(255,255,255,0.3);font-style:italic;">unavailable</span>`
                : `<span class="orders-count">${p.totalOrders}</span>`;

            tr.innerHTML = `
                <td>
                    <div style="font-weight:600; color:#fff; line-height:1.4;">${p.title}</div>
                </td>
                <td class="product-id-cell">${p.shopifyProductId}</td>
                <td>${orderDisplay}</td>
                <td>
                    <a href="${p.handle ? `https://gigglo.in/products/${p.handle}` : p.adminUrl}" 
                       target="_blank" class="shopify-link">Open →</a>
                </td>
            `;
            tbody.appendChild(tr);
        });
        grid.innerHTML = '';
        grid.appendChild(table);
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

// ---- Drag state ----
let dragSrcIndex = null;

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

    const images = data.localImages || [];

    if (images.length > 0) {
        images.forEach((img, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'image-wrapper';
            wrapper.draggable = true;
            wrapper.dataset.index = index;

            // Position badge
            const badge = document.createElement('div');
            badge.className = 'img-badge' + (index < 3 ? ' img-badge-active' : '');
            badge.textContent = index + 1;
            badge.title = index < 3 ? 'Used in AI description' : 'Not in description (drag to reorder)';

            // Media element
            const isVideo = img.spacesUrl && /\.(mp4|webm|mov)(\?|$)/i.test(img.spacesUrl);
            let mediaEl;
            if (isVideo) {
                mediaEl = document.createElement('video');
                mediaEl.src = img.spacesUrl;
                mediaEl.muted = true;
                mediaEl.loop = true;
                mediaEl.playsInline = true;
                mediaEl.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;';
                mediaEl.addEventListener('mouseenter', () => mediaEl.play());
                mediaEl.addEventListener('mouseleave', () => mediaEl.pause());
            } else {
                mediaEl = document.createElement('img');
                mediaEl.src = img.spacesUrl;
                mediaEl.alt = 'Product image';
                mediaEl.loading = 'lazy';
            }

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '✕';
            deleteBtn.title = 'Remove this image';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                data.localImages.splice(index, 1);
                renderPreview(data);
            };

            // Drag events
            wrapper.addEventListener('dragstart', (e) => {
                dragSrcIndex = index;
                wrapper.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            wrapper.addEventListener('dragend', () => {
                wrapper.classList.remove('dragging');
                document.querySelectorAll('.image-wrapper').forEach(w => w.classList.remove('drag-over'));
            });
            wrapper.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                document.querySelectorAll('.image-wrapper').forEach(w => w.classList.remove('drag-over'));
                wrapper.classList.add('drag-over');
            });
            wrapper.addEventListener('drop', (e) => {
                e.preventDefault();
                wrapper.classList.remove('drag-over');
                if (dragSrcIndex === null || dragSrcIndex === index) return;
                // Reorder
                const moved = data.localImages.splice(dragSrcIndex, 1)[0];
                data.localImages.splice(index, 0, moved);
                dragSrcIndex = null;
                renderPreview(data);
            });

            wrapper.appendChild(badge);
            wrapper.appendChild(mediaEl);
            wrapper.appendChild(deleteBtn);
            els.originalImages.appendChild(wrapper);
        });
    } else {
        els.originalImages.innerHTML = '<p class="empty-state">No images found</p>';
    }

    // Upload button (after images)
    const uploadZone = document.createElement('div');
    uploadZone.className = 'upload-zone';
    uploadZone.innerHTML = `
        <input type="file" id="imageUploadInput" multiple accept="image/*,video/mp4,video/webm" style="display:none">
        <button class="upload-zone-btn" onclick="document.getElementById('imageUploadInput').click()">
            <span style="font-size:20px;">📤</span>
            <span>Upload Images</span>
            <span style="font-size:11px;color:var(--text-muted);">JPG, PNG, WebP, MP4</span>
        </button>
    `;
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) handleImageUpload(e.dataTransfer.files);
    });
    els.originalImages.appendChild(uploadZone);

    // Wire up file input inside the newly-added zone
    const fileInput = document.getElementById('imageUploadInput');
    if (fileInput) fileInput.addEventListener('change', (e) => handleImageUpload(e.target.files));

    els.previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleImageUpload(files) {
    if (!files || files.length === 0) return;
    if (!state.scrapedData) { showToast('Please fetch a product first', 'warning'); return; }

    showToast(`Uploading ${files.length} file(s)...`, 'info');

    const formData = new FormData();
    for (const file of files) formData.append('images', file);

    try {
        const res = await apiFetch('/api/upload-images', { method: 'POST', body: formData });
        if (!res) return;
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        if (!state.scrapedData.localImages) state.scrapedData.localImages = [];
        for (const f of data.files) {
            state.scrapedData.localImages.push({ spacesUrl: f.spacesUrl, filename: f.filename });
        }

        renderPreview(state.scrapedData);
        showToast(`${data.files.length} image(s) uploaded successfully!`, 'success');
    } catch (err) {
        showToast(`Upload failed: ${err.message}`, 'error');
    }
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
        const imageUrls = state.scrapedData.localImages.map(img => img.spacesUrl);
        const customApiKey = els.customApiKey.value.trim();
        const brand = els.productBrand.value.trim();
        const ourBrand = els.ourBrandName.value.trim();

        const res = await apiFetch('/api/process-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrls, customApiKey, brand, ourBrand }),
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
        const imgSrc = result.spacesUrl;

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
        const imageUrl = state.processedImages[index].spacesUrl;
        const customApiKey = els.customApiKey.value.trim();

        const res = await apiFetch('/api/process-image-custom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl, customPrompt, customApiKey }),
        });
        if (!res) return;
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        state.processedImages[index] = data.result;
        const img = card.querySelector('img');
        img.src = data.result.spacesUrl + '?t=' + Date.now();
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
        const imageUrls = state.processedImages.length > 0
            ? state.processedImages.map(img => img.spacesUrl)
            : state.scrapedData?.localImages?.map(img => img.spacesUrl) || [];

        showProgress('Uploading images...', 20);

        const res = await apiFetch('/api/create-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                bodyHtml: state.descriptionHtml || '',
                descriptionJSON: state.descriptionJSON || null,
                imageUrls,
                price: els.finalPrice.value || '0.00',
                compareAtPrice: els.finalCompareAtPrice ? (els.finalCompareAtPrice.value || null) : null,
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
    // Use AI-processed images if available (Spaces URLs)
    if (state.processedImages.length > 0) {
        return state.processedImages.map(img => img.spacesUrl);
    }
    // Fall back to original scraped images
    if (state.scrapedData?.localImages?.length > 0) {
        return state.scrapedData.localImages.map(img => img.spacesUrl);
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
