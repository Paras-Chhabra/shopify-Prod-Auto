/**
 * Prisma DB client — replaces mongoose connection
 * Uses DigitalOcean Managed PostgreSQL
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

async function connectDB() {
    try {
        await prisma.$connect();
        console.log('✅ PostgreSQL connected (DigitalOcean)');
    } catch (err) {
        console.error('❌ PostgreSQL connection failed:', err.message);
        process.exit(1);
    }
}

module.exports = { prisma, connectDB };
