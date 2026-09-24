/* =====================================================================================
   PIXELGAUNT MERCH STORE
   -------------------------------------------------------------------------------------
   Renders the product grid on merch.html from the MERCH_ITEMS list below. Nothing here
   is invented: the list ships empty, and the page shows an honest "opening soon" state
   until you add real products.

   Purchasing: each item's `buyUrl` is a hosted checkout link you create in a payment
   provider (Stripe Payment Link, Gumroad, Shopify Buy Button, Lemon Squeezy, etc.). The
   Buy button opens it in a new tab. Card details never touch this site. An item without
   a `buyUrl` shows a disabled "Coming soon" button.

   Fields per item:
     id           unique short id, letters/numbers/dashes
     name         product name
     description  one or two sentences
     image        image file path or URL (optional - a placeholder icon is shown without it)
     price        display text, e.g. '$24.99' (optional)
     buyUrl       https:// checkout link (optional)

   Example (copy into the list, edit, remove the comment marks):
     { id: 'driller-tee', name: 'Girl: The Driller Tee', description: 'Soft cotton tee with the cover art.',
       image: 'merch-driller-tee.png', price: '$24.99', buyUrl: 'https://buy.stripe.com/your-link' },
   ===================================================================================== */
(function () {
    'use strict';

    var MERCH_ITEMS = [
        // Add products here.
    ];

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Only allow real web links for checkout and images (blocks javascript: and similar).
    function safeUrl(u) {
        u = String(u || '').trim();
        return /^https:\/\//i.test(u) ? u : '';
    }

    function safeImage(u) {
        u = String(u || '').trim();
        if (!u || /^\s*(javascript|data|vbscript):/i.test(u)) return '';
        return encodeURI(u).replace(/'/g, '%27');
    }

    function card(item) {
        var buy = safeUrl(item.buyUrl);
        var img = safeImage(item.image);
        var imgHtml = img
            ? '<div class="merch-img" role="img" aria-label="' + esc(item.name) + '" style="background-image:url(\'' + img + '\')"></div>'
            : '<div class="merch-img" aria-hidden="true"><i class="fas fa-shirt"></i></div>';
        var btn = buy
            ? '<a class="merch-btn" href="' + esc(buy) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-bag-shopping" aria-hidden="true"></i> Buy now</a>'
            : '<span class="merch-btn" aria-disabled="true">Coming soon</span>';
        return '<article class="merch-card">' + imgHtml +
            '<div class="merch-body">' +
            '<h3>' + esc(item.name) + '</h3>' +
            (item.description ? '<p>' + esc(item.description) + '</p>' : '<p></p>') +
            (item.price ? '<div class="merch-price">' + esc(item.price) + '</div>' : '') +
            btn +
            '</div></article>';
    }

    function render() {
        var root = document.getElementById('merch-root');
        if (!root) return;
        var items = MERCH_ITEMS.filter(function (i) { return i && i.id && i.name; });
        if (!items.length) {
            root.innerHTML = '<div class="merch-empty"><i class="fas fa-shirt" aria-hidden="true"></i>' +
                '<p><b style="color:#fff;">The merch store is opening soon.</b></p>' +
                '<p style="margin-top:6px;">Want something made from your own game art right now? Use the custom merch &amp; prints request below.</p></div>';
            return;
        }
        root.innerHTML = '<div class="merch-grid">' + items.map(card).join('') + '</div>';
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
})();
