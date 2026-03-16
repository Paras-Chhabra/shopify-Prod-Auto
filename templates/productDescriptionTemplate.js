/**
 * Master Product Description Template
 * Renders structured JSON into premium Shopify-ready HTML.
 *
 * @param {Object} data - AI-generated JSON data
 * @param {string[]} imageUrls - Product image URLs
 * @returns {string} Final HTML description
 */
function productTemplate(data, imageUrls = []) {
    const sections = [];

    // ---- Responsive CSS (inline for Shopify compatibility) ----
    sections.push(`<style>
.pd-wrap{font-family:'Inter',system-ui,-apple-system,sans-serif;color:#1a1a2e;max-width:860px;margin:0 auto;line-height:1.7}
.pd-wrap *{box-sizing:border-box}
.pd-hero{text-align:center;padding:32px 20px 24px;background:linear-gradient(135deg,#f8f6ff 0%,#eef2ff 100%);border-radius:16px;margin-bottom:28px}
.pd-hero h2{font-size:26px;font-weight:800;color:#1a1a2e;margin:0 0 12px;letter-spacing:-0.02em}
.pd-hero p{font-size:16px;color:#4a4a6a;margin:0;max-width:600px;display:inline-block}
.pd-section-title{font-size:20px;font-weight:700;color:#1a1a2e;margin:0 0 16px;padding-bottom:8px;border-bottom:3px solid #7c3aed;display:inline-block}
.pd-angles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:28px}
.pd-card{background:#fff;border:1px solid #e8e8f0;border-radius:14px;padding:24px 20px;text-align:center;transition:box-shadow .2s}
.pd-card:hover{box-shadow:0 8px 24px rgba(124,58,237,.1)}
.pd-card .emoji{font-size:32px;margin-bottom:8px;display:block}
.pd-card h4{font-size:15px;font-weight:700;color:#1a1a2e;margin:0 0 6px}
.pd-card p{font-size:13px;color:#6b7280;margin:0;line-height:1.5}
.pd-img-section{margin-bottom:28px;text-align:center}
.pd-img-section img{width:100%;max-width:720px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.pd-box{margin-bottom:28px}
.pd-box-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.pd-box-item{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;display:flex;align-items:flex-start;gap:12px}
.pd-box-item .icon{font-size:22px;flex-shrink:0;margin-top:2px}
.pd-box-item h5{font-size:14px;font-weight:600;color:#1a1a2e;margin:0 0 2px}
.pd-box-item p{font-size:12px;color:#6b7280;margin:0}
.pd-features{margin-bottom:28px}
.pd-features table{width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.pd-features th,.pd-features td{text-align:left;padding:12px 16px;font-size:14px}
.pd-features th{background:#7c3aed;color:#fff;font-weight:600}
.pd-features tr:nth-child(even){background:#f9fafb}
.pd-features tr:nth-child(odd){background:#fff}
.pd-features td:first-child{font-weight:600;color:#1a1a2e}
.pd-features td:last-child{color:#4a4a6a}
.pd-promise{margin-bottom:28px}
.pd-promise-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.pd-promise-card{background:linear-gradient(135deg,#f0fdf4 0%,#ecfdf5 100%);border:1px solid #bbf7d0;border-radius:12px;padding:20px 16px;text-align:center}
.pd-promise-card .icon{font-size:28px;margin-bottom:6px;display:block}
.pd-promise-card h5{font-size:14px;font-weight:700;color:#166534;margin:0 0 4px}
.pd-promise-card p{font-size:12px;color:#4ade80;margin:0;font-weight:500}
.pd-reviews{margin-bottom:28px}
.pd-review{background:#fff;border:1px solid #e8e8f0;border-radius:12px;padding:18px 20px;margin-bottom:12px}
.pd-review .stars{color:#f59e0b;font-size:16px;letter-spacing:2px;margin-bottom:6px}
.pd-review .text{font-size:14px;color:#374151;font-style:italic;margin-bottom:6px;line-height:1.6}
.pd-review .author{font-size:12px;color:#9ca3af;font-weight:600}
.pd-faq{margin-bottom:28px}
.pd-faq-item{border:1px solid #e5e7eb;border-radius:10px;margin-bottom:10px;overflow:hidden}
.pd-faq-q{background:#f9fafb;padding:14px 18px;font-size:14px;font-weight:600;color:#1a1a2e;cursor:pointer;display:flex;justify-content:space-between;align-items:center}
.pd-faq-a{padding:12px 18px;font-size:13px;color:#6b7280;line-height:1.6;border-top:1px solid #e5e7eb}
.pd-delivery{background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #93c5fd;border-radius:14px;padding:24px;text-align:center;margin-bottom:12px}
.pd-delivery-grid{display:flex;justify-content:center;gap:28px;flex-wrap:wrap}
.pd-delivery-item{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:#1e40af}
.pd-delivery-item .icon{font-size:20px}
@media(max-width:640px){
.pd-angles{grid-template-columns:1fr}
.pd-box-grid{grid-template-columns:1fr}
.pd-promise-grid{grid-template-columns:1fr}
.pd-delivery-grid{flex-direction:column;align-items:center;gap:12px}
.pd-hero h2{font-size:22px}
}
</style>`);

    sections.push('<div class="pd-wrap">');

    // ---- SECTION 1: HERO ----
    if (data.tagline || data.intro) {
        sections.push(`<div class="pd-hero">`);
        if (data.tagline) sections.push(`<h2>${esc(data.tagline)}</h2>`);
        if (data.intro) sections.push(`<p>${esc(data.intro)}</p>`);
        sections.push(`</div>`);
    }

    // ---- SECTION 2: BENEFIT / ANGLE CARDS ----
    if (data.angles && data.angles.length > 0) {
        sections.push(`<div style="margin-bottom:28px;">`);
        sections.push(`<h3 class="pd-section-title">✨ Why You'll Love It</h3>`);
        sections.push(`<div class="pd-angles">`);
        for (const a of data.angles) {
            sections.push(`<div class="pd-card">
                <span class="emoji">${a.emoji || '⭐'}</span>
                <h4>${esc(a.title)}</h4>
                <p>${esc(a.description)}</p>
            </div>`);
        }
        sections.push(`</div></div>`);
    }

    // ---- SECTION 3: PRODUCT IMAGE (first image) ----
    if (imageUrls.length > 0) {
        sections.push(`<div class="pd-img-section">
            <img src="${imageUrls[0]}" alt="Product image" />
        </div>`);
    }

    // ---- SECTION 4: WHAT'S INCLUDED ----
    if (data.box_items && data.box_items.length > 0) {
        sections.push(`<div class="pd-box">`);
        sections.push(`<h3 class="pd-section-title">📦 What's Included</h3>`);
        sections.push(`<div class="pd-box-grid">`);
        for (const item of data.box_items) {
            sections.push(`<div class="pd-box-item">
                <span class="icon">${item.emoji || '📌'}</span>
                <div>
                    <h5>${esc(item.name)}</h5>
                    <p>${esc(item.description || '')}</p>
                </div>
            </div>`);
        }
        sections.push(`</div></div>`);
    }

    // ---- Insert second image between sections if available ----
    if (imageUrls.length > 1) {
        sections.push(`<div class="pd-img-section">
            <img src="${imageUrls[1]}" alt="Product image" />
        </div>`);
    }

    // ---- SECTION 5: FEATURES TABLE ----
    if (data.features && data.features.length > 0) {
        sections.push(`<div class="pd-features">`);
        sections.push(`<h3 class="pd-section-title">📋 Product Details</h3>`);
        sections.push(`<table><thead><tr><th>Feature</th><th>Details</th></tr></thead><tbody>`);
        for (const f of data.features) {
            sections.push(`<tr><td>${esc(f.name)}</td><td>${esc(f.value)}</td></tr>`);
        }
        sections.push(`</tbody></table></div>`);
    }

    // ---- SECTION 6: TRUST / PROMISE ----
    if (data.promise && data.promise.length > 0) {
        sections.push(`<div class="pd-promise">`);
        sections.push(`<h3 class="pd-section-title">🛡️ Our Promise</h3>`);
        sections.push(`<div class="pd-promise-grid">`);
        for (const p of data.promise) {
            sections.push(`<div class="pd-promise-card">
                <span class="icon">${p.emoji || '✅'}</span>
                <h5>${esc(p.title)}</h5>
                <p>${esc(p.description || '')}</p>
            </div>`);
        }
        sections.push(`</div></div>`);
    }

    // ---- Insert third image before reviews if available ----
    if (imageUrls.length > 2) {
        sections.push(`<div class="pd-img-section">
            <img src="${imageUrls[2]}" alt="Product image" />
        </div>`);
    }

    // ---- SECTION 7: CUSTOMER REVIEWS ----
    if (data.reviews && data.reviews.length > 0) {
        sections.push(`<div class="pd-reviews">`);
        sections.push(`<h3 class="pd-section-title">💬 What Customers Say</h3>`);
        for (const r of data.reviews) {
            const stars = '★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5));
            sections.push(`<div class="pd-review">
                <div class="stars">${stars}</div>
                <div class="text">"${esc(r.text)}"</div>
                <div class="author">— ${esc(r.name)}${r.city ? ', ' + esc(r.city) : ''}</div>
            </div>`);
        }
        sections.push(`</div>`);
    }

    // ---- SECTION 8: FAQ ----
    if (data.faqs && data.faqs.length > 0) {
        sections.push(`<div class="pd-faq">`);
        sections.push(`<h3 class="pd-section-title">❓ Frequently Asked Questions</h3>`);
        for (const faq of data.faqs) {
            sections.push(`<div class="pd-faq-item">
                <div class="pd-faq-q">${esc(faq.question)} <span>▼</span></div>
                <div class="pd-faq-a">${esc(faq.answer)}</div>
            </div>`);
        }
        sections.push(`</div>`);
    }

    // ---- SECTION 9: DELIVERY BANNER ----
    if (data.delivery && data.delivery.length > 0) {
        sections.push(`<div class="pd-delivery">`);
        sections.push(`<div class="pd-delivery-grid">`);
        for (const d of data.delivery) {
            sections.push(`<div class="pd-delivery-item">
                <span class="icon">${d.emoji || '🚚'}</span>
                <span>${esc(d.text)}</span>
            </div>`);
        }
        sections.push(`</div></div>`);
    }

    sections.push('</div>');

    return sections.join('\n');
}

/** Escape HTML entities to prevent XSS */
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = { productTemplate };
