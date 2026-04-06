require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { prisma, connectDB } = require('./modules/db');
const { scrapeProduct } = require('./modules/scraper');
const { processImages, processImageWithPrompt, generateDescriptionJSON, generateDescriptionJSONWithPrompt, generateTitle } = require('./modules/gemini');
const { testConnection, uploadFile, createProduct, publishToAllChannels, restRequest } = require('./modules/shopify');
const { productTemplate } = require('./templates/productDescriptionTemplate');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';

// Connect to PostgreSQL on startup
connectDB();

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// ============================================================
// Auth Middleware — JWT
// ============================================================
const requireAuth = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized: Please log in' });
        return res.redirect('/login.html');
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie('token');
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Session expired. Please log in again.' });
        return res.redirect('/login.html');
    }
};

// Protect index route
app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
        return requireAuth(req, res, next);
    }
    next();
});

// Serve static files (images are now on DO Spaces — no /temp serving needed)
app.use(express.static(path.join(__dirname, 'public')));

// Protect ALL /api/* routes globally
app.use('/api', requireAuth);

// ============================================================
// Auth Routes
// ============================================================

app.post('/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'Name, email and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        }

        const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (existing) {
            return res.status(409).json({ success: false, error: 'An account with this email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({ data: { name, email: email.toLowerCase(), passwordHash } });

        const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
        res.json({ success: true, name: user.name });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ success: false, error: 'Signup failed. Please try again.' });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
        res.json({ success: true, name: user.name });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
    }
});

app.post('/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// ============================================================
// API Routes (all protected by requireAuth middleware above)
// ============================================================

app.get('/api/me', (req, res) => {
    res.json({ name: req.user.name, email: req.user.email });
});

app.get('/api/test-connection', async (req, res) => {
    try {
        const result = await testConnection();
        res.json(result);
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

/**
 * Get user's products with order counts (last 15 days)
 */
app.get('/api/my-products-with-orders', async (req, res) => {
    try {
        const dbProducts = await prisma.product.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
        });

        if (dbProducts.length === 0) {
            return res.json({ success: true, products: [] });
        }

        // Fetch last 15 days of Shopify orders
        const since = new Date();
        since.setDate(since.getDate() - 15);
        const sinceIso = since.toISOString();

        const orderCounts = {};
        let pageUrl = `/orders.json?status=any&created_at_min=${encodeURIComponent(sinceIso)}&limit=250&fields=line_items`;
        let hasMore = true;

        try {
            while (hasMore) {
                const data = await restRequest('GET', pageUrl);
                const orders = data.orders || [];

                for (const order of orders) {
                    for (const item of order.line_items || []) {
                        const pid = String(item.product_id);
                        orderCounts[pid] = (orderCounts[pid] || 0) + item.quantity;
                    }
                }

                if (orders.length < 250) {
                    hasMore = false;
                } else {
                    const lastOrder = orders[orders.length - 1];
                    pageUrl = `/orders.json?status=any&created_at_min=${encodeURIComponent(sinceIso)}&created_at_max=${encodeURIComponent(lastOrder.created_at)}&limit=250&fields=line_items&since_id=${lastOrder.id}`;
                }
            }
        } catch (shopifyErr) {
            console.error('Shopify orders fetch failed (graceful):', shopifyErr.message);
        }

        const products = dbProducts.map(p => ({
            id: p.id,
            shopifyProductId: p.shopifyProductId,
            handle: p.handle,
            title: p.title,
            status: p.status,
            adminUrl: p.adminUrl,
            imageUrl: p.imageUrl,
            createdAt: p.createdAt,
            totalOrders: orderCounts[p.shopifyProductId] ?? null,
        }));

        res.json({ success: true, products });
    } catch (err) {
        console.error('my-products-with-orders error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

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

app.post('/api/process-images', async (req, res) => {
    try {
        const { imageUrls, customApiKey, brand, ourBrand } = req.body;
        if (!imageUrls || !imageUrls.length) {
            return res.status(400).json({ error: 'imageUrls array is required' });
        }
        console.log(`Processing ${imageUrls.length} images...`);
        const results = await processImages(imageUrls, customApiKey, brand, ourBrand);
        res.json({ success: true, results });
    } catch (error) {
        console.error('Image processing error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/process-image-custom', async (req, res) => {
    try {
        const { imageUrl, customPrompt, customApiKey } = req.body;
        if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });
        if (!customPrompt) return res.status(400).json({ error: 'customPrompt is required' });
        const result = await processImageWithPrompt(imageUrl, customPrompt, customApiKey);
        res.json({ success: true, result });
    } catch (error) {
        console.error('Custom image processing error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/generate-content', async (req, res) => {
    try {
        const { productData, imageUrls, customApiKey } = req.body;
        if (!productData) return res.status(400).json({ error: 'productData is required' });

        const [title, descriptionJSON] = await Promise.all([
            generateTitle(productData, customApiKey),
            generateDescriptionJSON(productData, customApiKey),
        ]);

        const descriptionHtml = productTemplate(descriptionJSON, imageUrls || []);
        res.json({ success: true, title, descriptionJSON, descriptionHtml });
    } catch (error) {
        console.error('Content generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Upload images to Shopify and create product, then save to DB
 */
app.post('/api/create-product', async (req, res) => {
    try {
        const { title, bodyHtml, imageUrls, price, compareAtPrice, vendor, productType, tags, status, inventoryQuantity, descriptionJSON } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });

        // Upload images to Shopify using Spaces URLs as source
        const uploadedImageUrls = [];
        if (imageUrls && imageUrls.length > 0) {
            for (let i = 0; i < imageUrls.length; i++) {
                const fileUrl = imageUrls[i];
                const ext = (fileUrl.split('.').pop() || 'jpg').split('?')[0];
                const filename = `product_${Date.now()}_${i}.${ext}`;
                try {
                    const uploaded = await uploadFile(fileUrl, filename);
                    uploadedImageUrls.push(uploaded.url);
                } catch (err) {
                    console.error(`Image upload failed: ${err.message}`);
                }
            }
        }

        // Re-render description with CDN URLs
        let finalBodyHtml = bodyHtml || '';
        if (descriptionJSON && uploadedImageUrls.filter(u => !u.includes('.mp4') && !u.includes('.webm') && !u.includes('.mov')).length > 0) {
            const imageOnlyUrls = uploadedImageUrls.filter(u => !u.includes('.mp4') && !u.includes('.webm') && !u.includes('.mov'));
            finalBodyHtml = productTemplate(descriptionJSON, imageOnlyUrls);
        }

        // Create on Shopify FIRST
        const shopifyProduct = await createProduct({
            title,
            bodyHtml: finalBodyHtml,
            images: uploadedImageUrls,
            price: price || '0.00',
            compareAtPrice,
            vendor: vendor || '',
            productType: productType || '',
            tags: tags || '',
            status: status || 'active',
            inventoryQuantity: inventoryQuantity || 100,
        });

        // Save to PostgreSQL
        const adminUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/products/${shopifyProduct.id}`;
        await prisma.product.create({
            data: {
                userId: req.user.id,
                shopifyProductId: String(shopifyProduct.id),
                title: shopifyProduct.title,
                handle: shopifyProduct.handle,
                status: shopifyProduct.status,
                imageUrl: shopifyProduct.images?.[0]?.src || null,
                adminUrl,
            },
        });

        // Publish to all sales channels (non-blocking)
        publishToAllChannels(shopifyProduct.id).catch(err =>
            console.error('Background publish failed:', err.message)
        );

        res.json({
            success: true,
            product: {
                id: shopifyProduct.id,
                title: shopifyProduct.title,
                handle: shopifyProduct.handle,
                status: shopifyProduct.status,
                adminUrl,
                images: shopifyProduct.images?.length || 0,
            },
        });
    } catch (error) {
        console.error('Product creation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
    console.log(`\n🚀 Shopify Product Automator running at http://localhost:${PORT}`);
    console.log(`\n📋 Configuration Status:`);
    console.log(`   Shopify:    ${process.env.SHOPIFY_STORE_URL ? '✅ ' + process.env.SHOPIFY_STORE_URL : '❌ Not configured'}`);
    console.log(`   Gemini:     ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   PostgreSQL: ${process.env.DATABASE_URL ? '✅ Connecting...' : '❌ Not configured'}`);
    console.log(`   DO Spaces:  ${process.env.DO_SPACES_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`\n💡 Open http://localhost:${PORT} in your browser to get started\n`);
});
