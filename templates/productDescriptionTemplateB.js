/**
 * Template B — Skince-style Editorial Product Description
 * Clean side-by-side layout: image left, text right.
 * Uses the same JSON schema as Template A.
 *
 * @param {Object} data - AI-generated JSON data
 * @param {string[]} imageUrls - Product image URLs
 * @returns {string} Final HTML description
 */
function productTemplateB(data, imageUrls = []) {
    const s = []; // sections

    // ── CSS ──
    s.push(`<style>
.tb-wrap{font-family:'Inter',system-ui,-apple-system,sans-serif;color:#111;max-width:900px;margin:0 auto;line-height:1.75;padding:0 16px}
.tb-wrap *{box-sizing:border-box}

/* ── Trust banner ── */
.tb-trust{display:flex;justify-content:center;gap:40px;flex-wrap:wrap;padding:24px 0 28px;border-bottom:1px solid #eee;margin-bottom:32px}
.tb-trust-item{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:#333}
.tb-trust-item .icon{font-size:26px}

/* ── Section heading ── */
.tb-heading{font-size:26px;font-weight:800;color:#111;margin:0 0 12px;line-height:1.3}
.tb-heading .emoji{margin-right:8px}
.tb-subheading{font-size:15px;color:#555;margin:0 0 20px;line-height:1.7}

/* ── Side-by-side row ── */
.tb-row{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:center;margin-bottom:36px}
.tb-row.reverse{direction:rtl}
.tb-row.reverse>*{direction:ltr}
.tb-row-img{width:100%;border-radius:12px;display:block;height:auto}
.tb-row-text{padding:8px 0}

/* ── Checklist ── */
.tb-checklist{list-style:none;padding:0;margin:0 0 8px}
.tb-checklist li{font-size:15px;color:#222;padding:5px 0;display:flex;align-items:flex-start;gap:8px}
.tb-checklist li::before{content:'✔️';flex-shrink:0}

/* ── Bullet list (plain) ── */
.tb-bullets{list-style:none;padding:0;margin:0 0 8px}
.tb-bullets li{font-size:14px;color:#333;padding:4px 0}
.tb-bullets li::before{content:'• ';font-weight:bold}

/* ── What's Included ── */
.tb-included{margin-bottom:36px}
.tb-included-list{list-style:none;padding:0;margin:0}
.tb-included-list li{font-size:14px;color:#333;padding:4px 0;display:flex;align-items:center;gap:8px}

/* ── Features table ── */
.tb-features{margin-bottom:36px}
.tb-features table{width:100%;border-collapse:collapse;font-size:14px}
.tb-features th{text-align:left;padding:12px 16px;background:#111;color:#fff;font-weight:600}
.tb-features td{padding:12px 16px;border-bottom:1px solid #eee}
.tb-features tr:nth-child(even){background:#fafafa}
.tb-features td:first-child{font-weight:600;color:#111}

/* ── FAQ ── */
.tb-faq{margin-bottom:36px}
.tb-faq-item{border:1.5px solid #ddd;border-radius:10px;margin-bottom:10px;overflow:hidden}
.tb-faq-q{padding:16px 20px;font-size:15px;font-weight:600;color:#111;display:flex;justify-content:space-between;align-items:center;cursor:pointer;background:#fff}
.tb-faq-a{padding:14px 20px;font-size:14px;color:#555;border-top:1px solid #eee;line-height:1.7}

/* ── Reviews ── */
.tb-reviews{margin-bottom:36px}
.tb-review{border:1px solid #eee;border-radius:12px;padding:20px;margin-bottom:12px;background:#fff}
.tb-review-stars{color:#f59e0b;font-size:16px;letter-spacing:2px;margin-bottom:6px}
.tb-review-text{font-size:14px;color:#333;font-style:italic;margin-bottom:8px;line-height:1.6}
.tb-review-author{font-size:12px;color:#999;font-weight:600}

/* ── Promise / Trust cards ── */
.tb-promise{margin-bottom:36px}
.tb-promise-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.tb-promise-card{background:#f8f8f8;border:1px solid #eee;border-radius:12px;padding:20px 16px;text-align:center}
.tb-promise-card .icon{font-size:28px;display:block;margin-bottom:6px}
.tb-promise-card h5{font-size:14px;font-weight:700;color:#111;margin:0 0 4px}
.tb-promise-card p{font-size:12px;color:#777;margin:0}

/* ── Delivery banner ── */
.tb-delivery{background:#111;color:#fff;border-radius:14px;padding:24px;text-align:center;margin-bottom:12px}
.tb-delivery-grid{display:flex;justify-content:center;gap:32px;flex-wrap:wrap}
.tb-delivery-item{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.tb-delivery-item .icon{font-size:20px}

/* ── Full-width image ── */
.tb-img-full{text-align:center;margin-bottom:32px}
.tb-img-full img{width:100%;max-width:800px;border-radius:12px;display:block;margin:0 auto;height:auto}

/* ── Responsive ── */
@media(max-width:768px){
.tb-row{grid-template-columns:1fr;gap:16px}
.tb-row.reverse{direction:ltr}
.tb-trust{gap:20px}
.tb-heading{font-size:22px}
.tb-promise-grid{grid-template-columns:1fr 1fr}
.tb-delivery-grid{gap:16px}
.tb-features th,.tb-features td{padding:10px 12px;font-size:13px}
}
@media(max-width:480px){
.tb-trust{flex-direction:column;align-items:center;gap:12px}
.tb-heading{font-size:20px}
.tb-promise-grid{grid-template-columns:1fr}
.tb-delivery-grid{flex-direction:column;gap:10px}
.tb-checklist li{font-size:14px}
}
</style>`);

    s.push('<div class="tb-wrap">');

    // ── TRUST BANNER (from delivery data) ──
    if (data.delivery && data.delivery.length > 0) {
        s.push('<div class="tb-trust">');
        for (const d of data.delivery) {
            s.push(`<div class="tb-trust-item">
                <span class="icon">${d.emoji || '📦'}</span>
                <span>${esc(d.text)}</span>
            </div>`);
        }
        s.push('</div>');
    }

    // ── HERO HEADING + INTRO ──
    if (data.tagline || data.intro) {
        s.push(`<div style="margin-bottom:28px">`);
        if (data.tagline) s.push(`<h2 class="tb-heading"><span class="emoji">✨</span>${esc(data.tagline)}</h2>`);
        if (data.intro) s.push(`<p class="tb-subheading">${esc(data.intro)}</p>`);
        s.push('</div>');
    }

    // ── IMAGE + BENEFIT ANGLES (row 1: image left, text right) ──
    if (data.angles && data.angles.length > 0) {
        s.push('<div class="tb-row">');
        // Left: first image
        if (imageUrls.length > 0) {
            s.push(`<div><img class="tb-row-img" src="${imageUrls[0]}" alt="Product" /></div>`);
        }
        // Right: angle cards as a heading + checklist
        s.push('<div class="tb-row-text">');
        s.push(`<h2 class="tb-heading"><span class="emoji">💖</span>Designed for you</h2>`);
        s.push('<ul class="tb-checklist">');
        for (const a of data.angles) {
            s.push(`<li>${esc(a.title)}${a.description ? ' — ' + esc(a.description) : ''}</li>`);
        }
        s.push('</ul>');
        s.push('</div>');
        s.push('</div>');
    }

    // ── IMAGE + WHY YOU'LL LOVE IT (row 2: text left, image right) ──
    if (data.box_items && data.box_items.length > 0) {
        s.push('<div class="tb-row reverse">');
        // Image (second image if available)
        if (imageUrls.length > 1) {
            s.push(`<div><img class="tb-row-img" src="${imageUrls[1]}" alt="Product" /></div>`);
        }
        // Text: what's included as checklist
        s.push('<div class="tb-row-text">');
        s.push(`<h2 class="tb-heading"><span class="emoji">🌿</span>Why you'll love it</h2>`);
        s.push('<ul class="tb-checklist">');
        for (const item of data.box_items) {
            s.push(`<li>${esc(item.name)}${item.description ? ' — ' + esc(item.description) : ''}</li>`);
        }
        s.push('</ul>');
        s.push('</div>');
        s.push('</div>');
    }

    // ── FULL-WIDTH IMAGE (third image) ──
    if (imageUrls.length > 2) {
        s.push(`<div class="tb-img-full"><img src="${imageUrls[2]}" alt="Product" /></div>`);
    }

    // ── FEATURES TABLE ──
    if (data.features && data.features.length > 0) {
        s.push('<div class="tb-features">');
        s.push(`<h2 class="tb-heading"><span class="emoji">🧪</span>Skin-Safe Technology</h2>`);
        s.push('<table><thead><tr><th>Feature</th><th>Details</th></tr></thead><tbody>');
        for (const f of data.features) {
            s.push(`<tr><td>${esc(f.name)}</td><td>${esc(f.value)}</td></tr>`);
        }
        s.push('</tbody></table></div>');
    }

    // ── IMAGE + WHAT'S INCLUDED (row 3) ──
    if (imageUrls.length > 3) {
        s.push('<div class="tb-row">');
        s.push(`<div><img class="tb-row-img" src="${imageUrls[3]}" alt="Product" /></div>`);
        s.push('<div class="tb-row-text">');
        s.push(`<h2 class="tb-heading"><span class="emoji">👜</span>Sleek, compact & travel ready</h2>`);
        s.push(`<p class="tb-subheading">Fits easily into your bag so you can stay groomed anytime, anywhere.</p>`);
        s.push('</div>');
        s.push('</div>');
    }

    // ── WHAT'S INCLUDED LIST ──
    if (data.box_items && data.box_items.length > 0) {
        s.push('<div class="tb-included">');
        s.push(`<h2 class="tb-heading"><span class="emoji">📦</span>What's Included</h2>`);
        s.push('<ul class="tb-included-list">');
        for (const item of data.box_items) {
            s.push(`<li><span>${item.emoji || '📌'}</span> ${esc(item.name)}</li>`);
        }
        s.push('</ul></div>');
    }

    // ── PROMISE / TRUST CARDS ──
    if (data.promise && data.promise.length > 0) {
        s.push('<div class="tb-promise">');
        s.push(`<h2 class="tb-heading"><span class="emoji">🛡️</span>Our Promise</h2>`);
        s.push('<div class="tb-promise-grid">');
        for (const p of data.promise) {
            s.push(`<div class="tb-promise-card">
                <span class="icon">${p.emoji || '✅'}</span>
                <h5>${esc(p.title)}</h5>
                <p>${esc(p.description || '')}</p>
            </div>`);
        }
        s.push('</div></div>');
    }

    // ── FULL-WIDTH IMAGE (fourth or fifth image) ──
    const extraImgIdx = imageUrls.length > 4 ? 4 : (imageUrls.length > 3 ? 3 : -1);
    if (extraImgIdx >= 0 && !data.box_items) {
        s.push(`<div class="tb-img-full"><img src="${imageUrls[extraImgIdx]}" alt="Product" /></div>`);
    }

    // ── REVIEWS ──
    if (data.reviews && data.reviews.length > 0) {
        s.push('<div class="tb-reviews">');
        s.push(`<h2 class="tb-heading"><span class="emoji">💬</span>What Customers Say</h2>`);
        for (const r of data.reviews) {
            const stars = '★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5));
            s.push(`<div class="tb-review">
                <div class="tb-review-stars">${stars}</div>
                <div class="tb-review-text">"${esc(r.text)}"</div>
                <div class="tb-review-author">— ${esc(r.name)}${r.city ? ', ' + esc(r.city) : ''}</div>
            </div>`);
        }
        s.push('</div>');
    }

    // ── FAQ ──
    if (data.faqs && data.faqs.length > 0) {
        s.push('<div class="tb-faq">');
        s.push(`<h2 class="tb-heading" style="text-align:center;font-size:28px">Frequently Asked Questions</h2>`);
        for (const faq of data.faqs) {
            s.push(`<div class="tb-faq-item">
                <div class="tb-faq-q">${esc(faq.question)} <span>▾</span></div>
                <div class="tb-faq-a">${esc(faq.answer)}</div>
            </div>`);
        }
        s.push('</div>');
    }

    // ── DELIVERY BANNER (dark) ──
    if (data.delivery && data.delivery.length > 0) {
        s.push('<div class="tb-delivery">');
        s.push('<div class="tb-delivery-grid">');
        for (const d of data.delivery) {
            s.push(`<div class="tb-delivery-item">
                <span class="icon">${d.emoji || '🚚'}</span>
                <span>${esc(d.text)}</span>
            </div>`);
        }
        s.push('</div></div>');
    }

    s.push('</div>');
    return s.join('\n');
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

module.exports = { productTemplateB };
