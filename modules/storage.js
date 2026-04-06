/**
 * DO Spaces (S3-compatible) storage module
 * Replaces local temp/ folder for image and video storage
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const fs = require('fs');
const path = require('path');

const REGION = process.env.DO_SPACES_REGION || 'sgp1';
const BUCKET = process.env.DO_SPACES_BUCKET || 'shopify-automator-media';
const ENDPOINT = process.env.DO_SPACES_ENDPOINT || `https://${REGION}.digitaloceanspaces.com`;
const CDN_BASE = process.env.DO_SPACES_CDN_ENDPOINT || `https://${BUCKET}.${REGION}.digitaloceanspaces.com`;

let s3Client = null;

function getS3Client() {
    if (!s3Client) {
        s3Client = new S3Client({
            endpoint: ENDPOINT,
            region: REGION,
            credentials: {
                accessKeyId: process.env.DO_SPACES_KEY,
                secretAccessKey: process.env.DO_SPACES_SECRET,
            },
            forcePathStyle: false,
        });
    }
    return s3Client;
}

/**
 * Upload a local file to DO Spaces
 * Returns the public CDN URL
 */
async function uploadToSpaces(localFilePath, keyPrefix = 'products') {
    const client = getS3Client();
    const filename = path.basename(localFilePath);
    const key = `${keyPrefix}/${Date.now()}_${filename}`;

    const fileStream = fs.createReadStream(localFilePath);
    const stats = fs.statSync(localFilePath);
    const ext = path.extname(filename).toLowerCase();

    // Determine content type
    const mimeTypes = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const upload = new Upload({
        client,
        params: {
            Bucket: BUCKET,
            Key: key,
            Body: fileStream,
            ContentType: contentType,
            ACL: 'public-read',
            ContentLength: stats.size,
        },
    });

    await upload.done();
    const publicUrl = `${CDN_BASE}/${key}`;
    console.log(`✅ Uploaded to Spaces: ${publicUrl}`);
    return publicUrl;
}

/**
 * Delete a file from Spaces by its full URL or key
 */
async function deleteFromSpaces(urlOrKey) {
    const client = getS3Client();
    const key = urlOrKey.startsWith('http') ? urlOrKey.replace(`${CDN_BASE}/`, '') : urlOrKey;

    try {
        await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
        console.log(`✅ Deleted from Spaces: ${key}`);
    } catch (err) {
        console.warn(`Failed to delete from Spaces: ${err.message}`);
    }
}

/**
 * Upload a buffer directly to Spaces (e.g. from AI-processed image)
 */
async function uploadBufferToSpaces(buffer, filename, keyPrefix = 'products') {
    const client = getS3Client();
    const key = `${keyPrefix}/${Date.now()}_${filename}`;
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp',
        '.mp4': 'video/mp4', '.webm': 'video/webm',
    };
    const contentType = mimeTypes[ext] || 'image/png';

    const upload = new Upload({
        client,
        params: {
            Bucket: BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            ACL: 'public-read',
        },
    });

    await upload.done();
    const publicUrl = `${CDN_BASE}/${key}`;
    console.log(`✅ Buffer uploaded to Spaces: ${publicUrl}`);
    return publicUrl;
}

module.exports = { uploadToSpaces, deleteFromSpaces, uploadBufferToSpaces };
