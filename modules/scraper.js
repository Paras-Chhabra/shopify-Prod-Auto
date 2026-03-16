const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const TEMP_DIR = path.join(__dirname, '..', 'temp');
const PROCESSED_DIR = path.join(TEMP_DIR, 'processed');

// Ensure temp directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });

function downloadImage(url, filename) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(TEMP_DIR, filename);
        const file = fs.createWriteStream(filePath);
        const client = url.startsWith('https') ? https : http;

        client.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                downloadImage(response.headers.location, filename).then(resolve).catch(reject);
                file.close();
                fs.unlinkSync(filePath);
                return;
            }
            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(filePath);
                reject(new Error(`Failed to download image: HTTP ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => { file.close(); resolve(filePath); });
        }).on('error', (err) => {
            file.close();
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            reject(err);
        });
    });
}

function extractFromJsonLd(jsonLdScripts) {
    for (const script of jsonLdScripts) {
        try {
            const data = typeof script === 'string' ? JSON.parse(script) : script;
            const items = Array.isArray(data) ? data : [data];

            for (const item of items) {
                if (item['@type'] === 'Product' || item['@type']?.includes?.('Product')) {
                    const result = {
                        title: item.name || '',
                        description: item.description || '',
                        brand: item.brand?.name || item.brand || '',
                        images: [],
                        price: '',
                        currency: '',
                    };

                    if (item.image) {
                        const imgs = Array.isArray(item.image) ? item.image : [item.image];
                        result.images = imgs.map(img => (typeof img === 'string' ? img : img.url || img.contentUrl || '')).filter(Boolean);
                    }

                    if (item.offers) {
                        const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
                        result.price = offer.price || offer.lowPrice || '';
                        result.currency = offer.priceCurrency || '';
                    }
                    return result;
                }
            }
        } catch (e) { }
    }
    return null;
}

/**
 * Normalize an image URL: strip query parameters that serve tiny sizes,
 * prefer the largest resolution, and clean up srcset fragments.
 */
function normalizeImageUrl(src, pageOrigin) {
    if (!src || src.startsWith('data:') || src.includes('placeholder') || src.length < 10) return null;

    // Trim whitespace
    src = src.trim();

    // Make absolute
    if (src.startsWith('//')) src = `https:${src}`;
    else if (src.startsWith('/')) src = `${pageOrigin}${src}`;
    else if (!src.startsWith('http')) src = `${pageOrigin}/${src}`;

    // Some sites append size params like ?width=100 — remove those to get full‑res
    try {
        const u = new URL(src);
        // Keep the URL as-is unless it's a known CDN resize param
        // Shopify: remove width/height params to get original size
        if (u.hostname.includes('shopify') || u.hostname.includes('cdn.shopify')) {
            u.searchParams.delete('width');
            u.searchParams.delete('height');
            // Also strip Shopify _100x100 style suffixes from filename
            u.pathname = u.pathname.replace(/_\d+x\d*(@\d+x)?/g, '');
        }
        return u.toString();
    } catch {
        return src;
    }
}

/**
 * Check if a URL looks like a product image (not a logo/icon/badge)
 */
function isProductImage(src) {
    if (!src) return false;
    const lc = src.toLowerCase();
    const excludePatterns = [
        'logo', 'icon', 'badge', 'sprite', 'pixel', 'tracking',
        'banner', 'promo', 'social', 'payment', 'trust', 'seal',
        'favicon', 'avatar', 'star', 'rating', 'review',
        'loading', 'spinner', 'skeleton', 'blank', '.svg',
        'facebook', 'twitter', 'instagram', 'pinterest', 'youtube',
        'googleplay', 'appstore',
    ];
    return !excludePatterns.some(p => lc.includes(p));
}

async function scrapeProduct(url) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1440, height: 900 });

        // ──────────────────────────────────────────────
        // LAYER 0: Intercept network requests for images
        // ──────────────────────────────────────────────
        const networkImages = new Set();
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            req.continue();
        });
        page.on('response', async (response) => {
            const resUrl = response.url();
            const contentType = response.headers()['content-type'] || '';
            if (contentType.startsWith('image/') && (contentType.includes('jpeg') || contentType.includes('png') || contentType.includes('webp'))) {
                // Only track images above a certain URL-path length (skip tiny tracking pixels)
                if (resUrl.length > 40 && isProductImage(resUrl)) {
                    networkImages.add(resUrl);
                }
            }
        });

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Scroll down to trigger lazy-loaded images
        await autoScroll(page);
        // Wait for lazy images to load
        await new Promise(r => setTimeout(r, 2000));

        // ──────────────────────────────────────────────
        // LAYERS 1-4: Extract from page
        // ──────────────────────────────────────────────
        const pageData = await page.evaluate(() => {
            const result = { jsonLd: [], og: {}, meta: {}, dom: {} };

            // ── LAYER 1: JSON-LD structured data ──
            document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
                try { result.jsonLd.push(el.textContent.trim()); } catch (e) { }
            });

            // ── LAYER 2: OpenGraph & meta tags ──
            const ogTags = ['og:title', 'og:description', 'og:image', 'og:price:amount', 'og:price:currency', 'og:url', 'og:site_name'];
            ogTags.forEach(tag => {
                const el = document.querySelector(`meta[property="${tag}"]`);
                if (el) result.og[tag] = el.getAttribute('content');
            });

            // Also grab ALL og:image tags (some sites list multiple)
            result.og['og:images'] = [...document.querySelectorAll('meta[property="og:image"]')]
                .map(el => el.getAttribute('content'))
                .filter(Boolean);

            const productMeta = ['product:price:amount', 'product:price:currency', 'product:brand'];
            productMeta.forEach(tag => {
                const el = document.querySelector(`meta[property="${tag}"]`);
                if (el) result.meta[tag] = el.getAttribute('content');
            });

            // ── LAYER 3: DOM scraping — title, desc, price, brand ──
            const titleSelectors = ['h1[class*="product"]', 'h1[class*="title"]', 'h1[itemprop="name"]', '.product-title h1', '.product-name h1', '.product__title', '[data-testid="product-title"]', '.pdp-title', 'h1'];
            for (const sel of titleSelectors) {
                const el = document.querySelector(sel);
                if (el && el.textContent.trim()) { result.dom.title = el.textContent.trim(); break; }
            }

            const descSelectors = ['[itemprop="description"]', '.product-description', '.product__description', '#product-description', '.pdp-description', '[class*="product"][class*="desc"]', '.product-details__description'];
            for (const sel of descSelectors) {
                const el = document.querySelector(sel);
                if (el && el.innerHTML.trim()) { result.dom.description = el.innerHTML.trim(); break; }
            }

            const priceSelectors = ['[itemprop="price"]', '.product-price', '.product__price', '[class*="price"][class*="current"]', '[class*="price"][class*="sale"]', '.pdp-price', '[data-testid="product-price"]', '.price'];
            for (const sel of priceSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const priceAttr = el.getAttribute('content');
                    if (priceAttr) result.dom.price = priceAttr;
                    else {
                        const match = el.textContent.trim().match(/[\d,]+\.?\d*/);
                        if (match) result.dom.price = match[0].replace(/,/g, '');
                    }
                    break;
                }
            }

            const brandEl = document.querySelector('[itemprop="brand"]') || document.querySelector('.product-brand') || document.querySelector('[class*="brand"]');
            if (brandEl) result.dom.brand = brandEl.textContent.trim();

            // ── LAYER 4: Multi-strategy DOM image extraction ──
            const images = new Set();

            // Strategy A: Product-specific container selectors
            const containerSelectors = [
                '.product-gallery', '.product-images', '.product__media-list',
                '.product__media', '.product-media', '.product__photos',
                '.product__images', '.product-single__photos', '.product-images-container',
                '[class*="product"][class*="gallery"]', '[class*="product"][class*="slider"]',
                '[class*="product"][class*="carousel"]', '[class*="product"][class*="photo"]',
                '[class*="product"][class*="image"]', '[class*="product"][class*="media"]',
                '#product-gallery', '#product-images', '#product-photos',
                '.pdp-image', '.pdp-gallery', '.pdp-images',
            ];

            for (const sel of containerSelectors) {
                const container = document.querySelector(sel);
                if (container) {
                    container.querySelectorAll('img').forEach(img => {
                        const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-zoom-image') || img.getAttribute('data-large_image') || img.getAttribute('data-original');
                        if (src && !src.includes('data:image') && !src.includes('placeholder') && src.length > 10) {
                            // Prefer srcset's largest image
                            const srcset = img.getAttribute('srcset');
                            if (srcset) {
                                const entries = srcset.split(',').map(s => s.trim().split(/\s+/));
                                const best = entries.sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))[0];
                                if (best && best[0]) images.add(best[0]);
                            } else {
                                images.add(src);
                            }
                        }
                    });
                }
            }

            // Strategy B: Direct img selectors (broader scan)
            const imgSelectors = [
                'img[itemprop="image"]',
                '.product-gallery img', '.product-images img', '.product__media img',
                '.gallery img', '.swiper-slide img', '.slick-slide img',
                '.carousel-item img', '.product-photo img', '.product-thumbs img',
                '[class*="thumbnail"] img', '[data-testid*="product-image"] img',
                '.product-single__media img',
            ];
            for (const sel of imgSelectors) {
                document.querySelectorAll(sel).forEach(img => {
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-zoom-image') || img.getAttribute('data-large_image') || img.getAttribute('data-original');
                    if (src && !src.includes('data:image') && !src.includes('placeholder') && src.length > 10) {
                        const srcset = img.getAttribute('srcset');
                        if (srcset) {
                            const entries = srcset.split(',').map(s => s.trim().split(/\s+/));
                            const best = entries.sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))[0];
                            if (best && best[0]) images.add(best[0]);
                        } else {
                            images.add(src);
                        }
                    }
                });
            }

            // Strategy C: <a> tags and data attributes that link to full-size images
            document.querySelectorAll('a[data-image], a[data-zoom-image], a[data-full-image], a[data-href], [data-zoom-image], [data-full-size], [data-large-image]').forEach(el => {
                const href = el.getAttribute('data-image') || el.getAttribute('data-zoom-image') || el.getAttribute('data-full-image') || el.getAttribute('data-large-image') || el.getAttribute('data-full-size') || el.getAttribute('href');
                if (href && /\.(jpg|jpeg|png|webp)/i.test(href)) {
                    images.add(href);
                }
            });

            // Strategy D: Look for Shopify-specific media JSON embedded in scripts
            document.querySelectorAll('script').forEach(script => {
                const text = script.textContent || '';
                // Shopify stores images in a `media` array within JSON configs
                try {
                    // Match patterns like "src":"//cdn.shopify.com/...jpg"
                    const matches = text.matchAll(/"(?:src|url|original|large|full)":\s*"(\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi);
                    for (const m of matches) {
                        if (m[1] && !m[1].includes('logo') && !m[1].includes('icon')) {
                            images.add(m[1]);
                        }
                    }
                } catch (e) { }
            });

            // Strategy E: Fallback — any large visible images on the page
            if (images.size < 2) {
                document.querySelectorAll('img').forEach(img => {
                    const src = img.getAttribute('src') || img.getAttribute('data-src');
                    const width = img.naturalWidth || parseInt(img.getAttribute('width')) || 0;
                    const height = img.naturalHeight || parseInt(img.getAttribute('height')) || 0;
                    const rect = img.getBoundingClientRect();
                    const isVisible = rect.width > 100 && rect.height > 100;

                    if (src && (width > 200 || height > 200 || isVisible) &&
                        !src.includes('logo') && !src.includes('icon') &&
                        !src.includes('data:image') && !src.includes('badge') &&
                        !src.includes('sprite') && !src.includes('.svg') &&
                        src.length > 10) {
                        images.add(src);
                    }
                });
            }

            result.dom.images = [...images];
            return result;
        });

        // ──────────────────────────────────────────────
        // MERGE all layers into a single deduplicated list
        // ──────────────────────────────────────────────
        let productData = extractFromJsonLd(pageData.jsonLd) || { title: '', description: '', brand: '', images: [], price: '', currency: '' };

        if (!productData.title) productData.title = pageData.og['og:title'] || pageData.dom.title || '';
        if (!productData.description) productData.description = pageData.og['og:description'] || pageData.dom.description || '';
        if (!productData.price) productData.price = pageData.og['og:price:amount'] || pageData.meta['product:price:amount'] || pageData.dom.price || '';
        if (!productData.currency) productData.currency = pageData.og['og:price:currency'] || pageData.meta['product:price:currency'] || '';
        if (!productData.brand) productData.brand = pageData.meta['product:brand'] || pageData.dom.brand || '';

        // MERGE images from all sources — not just one layer
        const pageUrl = new URL(url);
        const allImageSources = [
            ...(productData.images || []),           // JSON-LD
            ...(pageData.og['og:images'] || []),     // All og:image tags
            ...(pageData.dom.images || []),           // DOM scraped
            ...[...networkImages],                   // Network intercepted
        ];

        // Normalize, deduplicate, filter
        const seenBases = new Set();
        const finalImages = [];
        for (const raw of allImageSources) {
            const normalized = normalizeImageUrl(raw, pageUrl.origin);
            if (!normalized || !isProductImage(normalized)) continue;

            // Deduplicate by stripping query params for comparison
            let baseKey;
            try { baseKey = new URL(normalized).pathname; } catch { baseKey = normalized; }
            if (seenBases.has(baseKey)) continue;
            seenBases.add(baseKey);

            finalImages.push(normalized);
        }

        productData.images = finalImages.slice(0, 15);

        console.log(`Found ${productData.images.length} images from: JSON-LD(${(productData.images || []).length}), OG(${(pageData.og['og:images'] || []).length}), DOM(${(pageData.dom.images || []).length}), Network(${networkImages.size})`);

        // Download all images locally
        const localImages = [];
        for (let i = 0; i < productData.images.length; i++) {
            try {
                const ext = path.extname(new URL(productData.images[i]).pathname).split('?')[0] || '.jpg';
                const filename = `${uuidv4()}${ext}`;
                const localPath = await downloadImage(productData.images[i], filename);
                localImages.push({ originalUrl: productData.images[i], localPath, filename });
            } catch (err) {
                console.error(`Failed to download image ${i + 1}: ${err.message}`);
            }
        }

        productData.localImages = localImages;
        productData.sourceUrl = url;
        console.log(`Successfully downloaded ${localImages.length}/${productData.images.length} images`);
        return productData;
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * Auto-scroll the page to trigger lazy-loaded images
 */
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 400;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    // Scroll back to top
                    window.scrollTo(0, 0);
                    clearInterval(timer);
                    resolve();
                }
            }, 150);
            // Safety timeout
            setTimeout(() => { clearInterval(timer); resolve(); }, 5000);
        });
    });
}

module.exports = { scrapeProduct, downloadImage };
