const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

function getConfig() {
    const storeUrl = process.env.SHOPIFY_STORE_URL;
    const adminToken = process.env.SHOPIFY_ADMIN_TOKEN;

    if (!storeUrl || !adminToken) {
        throw new Error('SHOPIFY_STORE_URL and SHOPIFY_ADMIN_TOKEN must be set in .env');
    }

    const cleanStore = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    return {
        storeUrl: cleanStore,
        adminToken,
        restBase: `https://${cleanStore}/admin/api/2024-01`,
        graphqlUrl: `https://${cleanStore}/admin/api/2024-01/graphql.json`,
    };
}

async function graphqlRequest(query, variables = {}) {
    const config = getConfig();

    const response = await axios.post(
        config.graphqlUrl,
        { query, variables },
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': config.adminToken,
            },
        }
    );

    if (response.data.errors) {
        throw new Error(`Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`);
    }

    return response.data.data;
}

async function restRequest(method, endpoint, data = null) {
    const config = getConfig();
    const url = `${config.restBase}${endpoint}`;

    const options = {
        method,
        url,
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': config.adminToken,
        },
    };

    if (data) options.data = data;

    const response = await axios(options);
    return response.data;
}

async function testConnection() {
    try {
        const data = await restRequest('GET', '/shop.json');
        return {
            success: true,
            shopName: data.shop.name,
            email: data.shop.email,
            domain: data.shop.domain,
        };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.errors || error.message,
        };
    }
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.ogg': 'video/ogg',
    };
    return types[ext] || 'image/jpeg';
}

function getShopifyContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (['.mp4', '.webm', '.mov', '.ogg'].includes(ext)) return 'VIDEO';
    return 'IMAGE';
}

/**
 * Upload a media file to Shopify.
 * Accepts a public DO Spaces URL — Shopify downloads it directly.
 * No staged upload or local file reading needed.
 */
async function uploadFile(fileUrl, filename) {
    const isVideo = /\.(mp4|webm|mov|ogg)/i.test(filename);
    const contentType = isVideo ? 'VIDEO' : 'IMAGE';

    const fileCreateQuery = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          ... on MediaImage {
            id
            image { url }
          }
          ... on Video {
            id
            sources { url }
          }
          ... on GenericFile {
            id
            url
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

    const fileResult = await graphqlRequest(fileCreateQuery, {
        files: [{ alt: filename, contentType, originalSource: fileUrl }],
    });

    const errors = fileResult.fileCreate?.userErrors || [];
    if (errors.length > 0) {
        throw new Error(`File create error: ${JSON.stringify(errors)}`);
    }

    const createdFile = fileResult.fileCreate.files[0];
    if (!createdFile) throw new Error('No file returned from Shopify fileCreate');

    const readyUrl = await waitForFileReady(createdFile.id, contentType);
    return { id: createdFile.id, url: readyUrl, mediaType: contentType.toLowerCase() };
}

async function waitForFileReady(fileId, contentType = 'IMAGE', maxAttempts = 20) {
    const query = `
    query getFile($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          id
          fileStatus
          image {
            url
          }
        }
        ... on Video {
          id
          fileStatus
          sources {
            url
          }
        }
        ... on GenericFile {
          id
          fileStatus
          url
        }
      }
    }
  `;

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000));

        const result = await graphqlRequest(query, { id: fileId });
        const node = result.node;

        if (node?.fileStatus === 'READY') {
            // Return the appropriate URL based on media type
            if (node.image?.url) return node.image.url;
            if (node.sources?.length > 0) return node.sources[0].url;
            if (node.url) return node.url;
        }
        if (node?.fileStatus === 'FAILED') {
            throw new Error('File processing failed on Shopify');
        }
    }

    throw new Error('Timeout waiting for file to be ready on Shopify');
}

async function createProduct(productData) {
    const { title, bodyHtml, images, price, compareAtPrice, vendor, productType, tags, status, inventoryQuantity } = productData;

    const product = {
        product: {
            title,
            body_html: bodyHtml,
            vendor: vendor || '',
            product_type: productType || '',
            tags: tags || '',
            status: status || 'draft',
            variants: [
                {
                    price: price || '0.00',
                    compare_at_price: compareAtPrice || null,
                    requires_shipping: true,
                    taxable: true,
                    inventory_management: 'shopify',
                    inventory_quantity: inventoryQuantity || 100,
                },
            ],
            metafields: [
                {
                    namespace: 'custom',
                    key: 'show_reviews',
                    value: 'false',
                    type: 'boolean',
                },
                {
                    namespace: 'custom',
                    key: 'show_faq',
                    value: 'false',
                    type: 'boolean',
                },
                {
                    namespace: 'custom',
                    key: 'show_safety',
                    value: 'false',
                    type: 'boolean',
                },
                {
                    namespace: 'custom',
                    key: 'show_benefits',
                    value: 'false',
                    type: 'boolean',
                },
            ],
        },
    };

    if (images && images.length > 0) {
        product.product.images = images.map((imgUrl, idx) => ({
            src: imgUrl,
            position: idx + 1,
        }));
    }

    const result = await restRequest('POST', '/products.json', product);
    return result.product;
}

/**
 * Publish a product to ALL available sales channels.
 * Queries the store's active publications and publishes to each.
 */
async function publishToAllChannels(shopifyProductId) {
    try {
        // 1. Get all available publications (sales channels)
        const pubQuery = `
            query {
                publications(first: 20) {
                    edges {
                        node {
                            id
                            name
                        }
                    }
                }
            }
        `;
        const pubResult = await graphqlRequest(pubQuery);
        const publications = pubResult.publications.edges.map(e => e.node);

        if (!publications.length) {
            console.log('No sales channels found to publish to');
            return;
        }

        console.log(`Publishing to ${publications.length} channel(s): ${publications.map(p => p.name).join(', ')}`);

        // 2. Publish to all channels in one mutation
        const productGid = `gid://shopify/Product/${shopifyProductId}`;
        const publishInput = publications.map(pub => ({ publicationId: pub.id }));

        const publishMutation = `
            mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
                publishablePublish(id: $id, input: $input) {
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const publishResult = await graphqlRequest(publishMutation, {
            id: productGid,
            input: publishInput,
        });

        const errors = publishResult.publishablePublish?.userErrors || [];
        if (errors.length > 0) {
            console.warn('Publish warnings:', errors.map(e => `${e.field}: ${e.message}`).join(', '));
        } else {
            console.log(`✅ Product published to all ${publications.length} sales channel(s)`);
        }
    } catch (err) {
        // Non-fatal — product is created, just not published to all channels
        console.error('publishToAllChannels error (non-fatal):', err.message);
    }
}

module.exports = {
    testConnection,
    uploadFile,
    createProduct,
    publishToAllChannels,
    graphqlRequest,
    restRequest,
};
