const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    shopifyProductId: {
        type: String,
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    handle: {
        type: String,
    },
    status: {
        type: String,
        default: 'draft',
    },
    imageUrl: {
        type: String,
    },
    adminUrl: {
        type: String,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Product', productSchema);
