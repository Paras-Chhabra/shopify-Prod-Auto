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
    };
    return types[ext] || 'image/jpeg';
}

async function uploadFile(filePath, filename) {
    const fileSize = fs.statSync(filePath).size;
    const mimeType = getMimeType(filePath);

    const stagedUploadQuery = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

    const stagedResult = await graphqlRequest(stagedUploadQuery, {
        input: [
            {
                filename: filename,
                mimeType: mimeType,
                httpMethod: 'POST',
                resource: 'FILE',
                fileSize: String(fileSize),
            },
        ],
    });

    const target = stagedResult.stagedUploadsCreate.stagedTargets[0];
    if (!target) {
        throw new Error('Failed to create staged upload target');
    }

    const form = new FormData();
    for (const param of target.parameters) {
        form.append(param.name, param.value);
    }
    form.append('file', fs.createReadStream(filePath), { filename });

    await axios.post(target.url, form, {
        headers: {
            ...form.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    const fileCreateQuery = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          ... on MediaImage {
            id
            image {
              url
            }
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
        files: [
            {
                alt: filename,
                contentType: 'IMAGE',
                originalSource: target.resourceUrl,
            },
        ],
    });

    if (fileResult.fileCreate.userErrors.length > 0) {
        throw new Error(`File create error: ${JSON.stringify(fileResult.fileCreate.userErrors)}`);
    }

    const createdFile = fileResult.fileCreate.files[0];
    const fileUrl = await waitForFileReady(createdFile.id);

    return {
        id: createdFile.id,
        url: fileUrl,
    };
}

async function waitForFileReady(fileId, maxAttempts = 20) {
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
      }
    }
  `;

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000));

        const result = await graphqlRequest(query, { id: fileId });
        const node = result.node;

        if (node?.fileStatus === 'READY' && node?.image?.url) {
            return node.image.url;
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

module.exports = {
    testConnection,
    uploadFile,
    createProduct,
    graphqlRequest,
    restRequest,
};
