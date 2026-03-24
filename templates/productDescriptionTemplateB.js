/**
 * Template B — Editorial 2-Image Row Layout
 * Each section: 2 stacked images (left) + text content (right).
 * Uses the same JSON schema as Template A.
 *
 * @param {Object} data - AI-generated JSON data
 * @param {string[]} imageUrls - Product image URLs
 * @returns {string} Final HTML description
 */
function productTemplateB(data, imageUrls = []) {
    const s = [];
    let imgIdx = 0; // global image counter

    // Helper: get next 2 images, cycling via modulo
    function next2Images() {
        if (!imageUrls.length) return '';
        const src1 = imageUrls[imgIdx % imageUrls.length];
        imgIdx++;
        const src2 = imageUrls[imgIdx % imageUrls.length];
        imgIdx++;
        return `<div class="tb-imgs">
            <img src="${src1}" alt="Product image" />
            <img src="${src2}" alt="Product image" />
        </div>`;
    }

    // ── CSS ──
    s.push(`<style>
.tb-wrap{font-family:'Inter',system-ui,-apple-system,sans-serif;color:#111;max-width:920px;margin:0 auto;line-height:1.75;padding:0 16px}
.tb-wrap *{box-sizing:border-box}

/* ── Row: images left, text right ── */
.tb-row{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start;margin-bottom:40px}
.tb-imgs{display:flex;flex-direction:column;gap:14px}
.tb-imgs img{width:100%;border-radius:12px;display:block;height:auto;object-fit:cover}
.tb-text{padding:8px 0}

/* ── Typography ── */
.tb-heading{font-size:26px;font-weight:800;color:#111;margin:0 0 14px;line-height:1.3}
.tb-heading .emoji{margin-right:8px}
.tb-para{font-size:15px;color:#444;margin:0 0 16px;line-height:1.75}

/* ── Bullet / checklist ── */
.tb-list{list-style:none;padding:0;margin:0 0 8px}
.tb-list li{font-size:15px;color:#222;padding:5px 0;display:flex;align-items:flex-start;gap:8px}
.tb-list li .bullet{flex-shrink:0}

/* ── Features table ── */
.tb-features{width:100%;border-collapse:collapse;font-size:14px;margin-top:8px}
.tb-features th{text-align:left;padding:12px 16px;background:#111;color:#fff;font-weight:600}
.tb-features td{padding:12px 16px;border-bottom:1px solid #eee}
.tb-features tr:nth-child(even){background:#fafafa}
.tb-features td:first-child{font-weight:600;color:#111}

/* ── Promise cards ── */
.tb-promise-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.tb-promise-card{background:#f8f8f8;border:1px solid #eee;border-radius:12px;padding:16px 14px;text-align:center}
.tb-promise-card .icon{font-size:26px;display:block;margin-bottom:4px}
.tb-promise-card h5{font-size:13px;font-weight:700;color:#111;margin:0 0 2px}
.tb-promise-card p{font-size:11px;color:#777;margin:0}

/* ── Reviews ── */
.tb-review{border:1px solid #eee;border-radius:10px;padding:16px;margin-bottom:10px;background:#fff}
.tb-review-stars{color:#f59e0b;font-size:15px;letter-spacing:2px;margin-bottom:4px}
.tb-review-text{font-size:13px;color:#333;font-style:italic;margin-bottom:6px;line-height:1.6}
.tb-review-author{font-size:11px;color:#999;font-weight:600}

/* ── FAQ ── */
.tb-faq-item{border:1.5px solid #ddd;border-radius:10px;margin-bottom:10px;overflow:hidden}
.tb-faq-q{padding:14px 18px;font-size:14px;font-weight:600;color:#111;display:flex;justify-content:space-between;align-items:center;background:#fff}
.tb-faq-a{padding:12px 18px;font-size:13px;color:#555;border-top:1px solid #eee;line-height:1.7}

/* ── Delivery banner ── */
.tb-delivery{background:#111;color:#fff;border-radius:14px;padding:22px;text-align:center;margin-top:12px}
.tb-delivery-grid{display:flex;justify-content:center;gap:28px;flex-wrap:wrap}
.tb-delivery-item{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.tb-delivery-item .icon{font-size:20px}

/* ── Responsive: stack vertically, images first ── */
@media(max-width:768px){
.tb-row{grid-template-columns:1fr;gap:18px}
.tb-imgs{order:-1}
.tb-heading{font-size:22px}
.tb-promise-grid{grid-template-columns:1fr}
.tb-delivery-grid{flex-direction:column;align-items:center;gap:10px}
.tb-features th,.tb-features td{padding:10px 12px;font-size:13px}
}
@media(max-width:480px){
.tb-heading{font-size:20px}
.tb-para{font-size:14px}
.tb-list li{font-size:14px}
}
</style>`);

    s.push('<div class="tb-wrap">');

    // ── ROW 1: Hero — tagline + intro + angles ──
    if (data.tagline || data.intro || (data.angles && data.angles.length)) {
        s.push('<div class="tb-row">');
        s.push(next2Images());
        s.push('<div class="tb-text">');
        if (data.tagline) s.push(`<h2 class="tb-heading"><span class="emoji">✨</span>${esc(data.tagline)}</h2>`);
        if (data.intro) s.push(`<p class="tb-para">${esc(data.intro)}</p>`);
        if (data.angles && data.angles.length) {
            s.push(`<h3 class="tb-heading" style="font-size:20px;"><span class="emoji">💖</span>Why You'll Love It</h3>`);
            s.push('<ul class="tb-list">');
            for (const a of data.angles) {
                s.push(`<li><span class="bullet">${a.emoji || '✔️'}</span>${esc(a.title)}${a.description ? ' — ' + esc(a.description) : ''}</li>`);
            }
            s.push('</ul>');
        }
        s.push('</div>');
        s.push('</div>');
    }

    // ── ROW 2: What's Included ──
    if (data.box_items && data.box_items.length) {
        s.push('<div class="tb-row">');
        s.push(next2Images());
        s.push('<div class="tb-text">');
        s.push(`<h2 class="tb-heading"><span class="emoji">📦</span>What's Included</h2>`);
        s.push('<ul class="tb-list">');
        for (const item of data.box_items) {
            s.push(`<li><span class="bullet">${item.emoji || '📌'}</span>${esc(item.name)}${item.description ? ' — ' + esc(item.description) : ''}</li>`);
        }
        s.push('</ul>');
        s.push('</div>');
        s.push('</div>');
    }

    // ── ROW 3: Features ──
    if (data.features && data.features.length) {
        s.push('<div class="tb-row">');
        s.push(next2Images());
        s.push('<div class="tb-text">');
        s.push(`<h2 class="tb-heading"><span class="emoji">📋</span>Product Details</h2>`);
        s.push('<table class="tb-features"><thead><tr><th>Feature</th><th>Details</th></tr></thead><tbody>');
        for (const f of data.features) {
            s.push(`<tr><td>${esc(f.name)}</td><td>${esc(f.value)}</td></tr>`);
        }
        s.push('</tbody></table>');
        s.push('</div>');
        s.push('</div>');
    }

    // ── ROW 4: Promise / Trust ──
    if (data.promise && data.promise.length) {
        s.push('<div class="tb-row">');
        s.push(next2Images());
        s.push('<div class="tb-text">');
        s.push(`<h2 class="tb-heading"><span class="emoji">🛡️</span>Our Promise</h2>`);
        s.push('<div class="tb-promise-grid">');
        for (const p of data.promise) {
            s.push(`<div class="tb-promise-card">
                <span class="icon">${p.emoji || '✅'}</span>
                <h5>${esc(p.title)}</h5>
                <p>${esc(p.description || '')}</p>
            </div>`);
        }
        s.push('</div>');
        s.push('</div>');
        s.push('</div>');
    }

    // ── ROW 5: Reviews ──
    if (data.reviews && data.reviews.length) {
        s.push('<div class="tb-row">');
        s.push(next2Images());
        s.push('<div class="tb-text">');
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
        s.push('</div>');
    }

    // ── ROW 6: FAQ ──
    if (data.faqs && data.faqs.length) {
        s.push('<div class="tb-row">');
        s.push(next2Images());
        s.push('<div class="tb-text">');
        s.push(`<h2 class="tb-heading"><span class="emoji">❓</span>Frequently Asked Questions</h2>`);
        for (const faq of data.faqs) {
            s.push(`<div class="tb-faq-item">
                <div class="tb-faq-q">${esc(faq.question)} <span>▾</span></div>
                <div class="tb-faq-a">${esc(faq.answer)}</div>
            </div>`);
        }
        s.push('</div>');
        s.push('</div>');
    }

    // ── DELIVERY BANNER (full width) ──
    if (data.delivery && data.delivery.length) {
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
