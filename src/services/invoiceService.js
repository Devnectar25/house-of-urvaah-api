const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const orderService = require('./orderService');
const settingsService = require('./settingsService');
const pool = require('../config/db');

/**
 * Converts a number to Indian Rupees words format.
 * e.g. 25980 -> "Rupees Twenty Five Thousand Nine Hundred Eighty Only"
 */
const numberToWords = (num) => {
    if (!num || isNaN(num) || Number(num) <= 0) return 'Rupees Zero Only';
    const amount = Math.round(Number(num));

    const ones = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const convertChunk = (n) => {
        let str = '';
        if (n >= 100) {
            str += ones[Math.floor(n / 100)] + ' Hundred ';
            n %= 100;
        }
        if (n >= 20) {
            str += tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '') + ' ';
        } else if (n > 0) {
            str += ones[n] + ' ';
        }
        return str;
    };

    let result = '';
    const crores = Math.floor(amount / 10000000);
    const lakhs = Math.floor((amount % 10000000) / 100000);
    const thousands = Math.floor((amount % 100000) / 1000);
    const hundreds = Math.floor(amount % 1000);

    if (crores > 0) result += convertChunk(crores) + 'Crore ';
    if (lakhs > 0) result += convertChunk(lakhs) + 'Lakh ';
    if (thousands > 0) result += convertChunk(thousands) + 'Thousand ';
    if (hundreds > 0) result += convertChunk(hundreds);

    const formatted = result.replace(/\s+/g, ' ').trim();
    return formatted ? `Rupees ${formatted} Only` : 'Rupees Zero Only';
};

/**
 * Reads the currency symbol from the frontend configuration file or fallback.
 */
const getCurrencySymbol = () => {
    try {
        const configPath = path.join(__dirname, '../../../reactshop-home/src/config/currencyConfig.ts');
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            const match = content.match(/CURRENCY_SYMBOL\s*=\s*["']([^"']+)["']/);
            return match ? match[1] : '₹';
        }
    } catch (error) {
        // quiet fallback
    }
    return '₹';
};

/**
 * Fetches and prepares all structured template data for an invoice.
 * @param {string|number} orderId - Order UUID or order number.
 * @returns {Promise<Object>} - Clean, rich invoice data object.
 */
exports.getInvoiceData = async (orderId, options = {}) => {
    // 1. Fetch order details with joined address info
    let order = await orderService.getOrderById(orderId);
    if (!order) throw new Error('Order not found');

    // Customer copy: only delivered, non-cancelled, non-returned line items, with the order amounts
    // scaled to those lines. The full (statutory) invoice is unchanged for admins.
    if (options.customerView) {
        const { getInvoiceEligibility } = require('./invoiceEligibility');
        const { eligible, eligibleItems, reason } = getInvoiceEligibility(order);
        if (!eligible) {
            const err = new Error(reason);
            err.statusCode = 403;
            throw err;
        }
        const lineTotal = (it) => (Number(it.price) || 0) * (Number(it.quantity) || 1);
        const eligibleSubtotal = eligibleItems.reduce((acc, it) => acc + lineTotal(it), 0);
        const orderSubtotal = Number(order.subtotal || 0);
        if (eligibleItems.length !== (order.items || []).length && orderSubtotal > 0 && eligibleSubtotal < orderSubtotal) {
            const ratio = eligibleSubtotal / orderSubtotal;
            const round2 = (n) => Math.round(n * 100) / 100;
            order = {
                ...order,
                items: eligibleItems,
                subtotal: round2(eligibleSubtotal),
                discount_amount: round2(Number(order.discount_amount || 0) * ratio),
                shipping: round2(Number(order.shipping || order.shipping_cost || 0) * ratio),
                total: round2(Number(order.total || 0) * ratio),
                cod_charge: round2(Number(order.cod_charge || 0) * ratio)
            };
        } else {
            order = { ...order, items: eligibleItems };
        }
    }

    // 2. Fetch user details for contact info
    let user = {};
    if (order.user_id) {
        try {
            const userResult = await pool.query(
                'SELECT username, emailid, contactno, phone, fullname, first_name, last_name FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(emailid) = LOWER($1) LIMIT 1',
                [order.user_id]
            );
            user = userResult.rows[0] || {};
        } catch (e) {
            console.warn('[Invoice] User lookup error:', e.message);
        }
    }

    // 3. Resolve customer details & address safely from order, joined address, or user_addresses table
    let shippingAddr = order.shippingAddress || order.shipping_address;
    if (typeof shippingAddr === 'string') {
        try { shippingAddr = JSON.parse(shippingAddr); } catch (e) {}
    }

    // If order is missing address details, perform lookup against user_addresses table
    if ((!order.full_address && !order.city) || !order.recipient_name) {
        if (order.address_id) {
            try {
                const addrRes = await pool.query('SELECT * FROM user_addresses WHERE id = $1 LIMIT 1', [order.address_id]);
                if (addrRes.rows.length > 0) {
                    const a = addrRes.rows[0];
                    order.recipient_name = order.recipient_name || a.recipient_name;
                    order.recipient_phone = order.recipient_phone || a.phone;
                    order.full_address = order.full_address || a.full_address;
                    order.city = order.city || a.city;
                    order.state = order.state || a.state;
                    order.postal_code = order.postal_code || a.postal_code;
                }
            } catch (addrErr) {
                console.warn('[Invoice] Address ID lookup failed:', addrErr.message);
            }
        }
        if ((!order.full_address && !order.city) && order.user_id) {
            try {
                const defAddrRes = await pool.query(
                    'SELECT * FROM user_addresses WHERE LOWER(user_id) = LOWER($1) ORDER BY is_default DESC, created_at DESC LIMIT 1',
                    [order.user_id]
                );
                if (defAddrRes.rows.length > 0) {
                    const a = defAddrRes.rows[0];
                    order.recipient_name = order.recipient_name || a.recipient_name;
                    order.recipient_phone = order.recipient_phone || a.phone;
                    order.full_address = order.full_address || a.full_address;
                    order.city = order.city || a.city;
                    order.state = order.state || a.state;
                    order.postal_code = order.postal_code || a.postal_code;
                }
            } catch (defAddrErr) {
                console.warn('[Invoice] Default user address lookup failed:', defAddrErr.message);
            }
        }
    }

    const shippingName = shippingAddr ? `${shippingAddr.fullName || shippingAddr.name || shippingAddr.firstName || shippingAddr.first_name || ''} ${shippingAddr.lastName || shippingAddr.last_name || ''}`.trim() : '';
    const recipientName = order.recipient_name || shippingAddr?.recipient_name || shippingName;
    const userFullName = user.fullname || [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    const rawCustomerName = (order.customer_name && !order.customer_name.includes('@'))
        ? order.customer_name
        : (recipientName || userFullName || (user.username && !user.username.includes('@') ? user.username : 'Valued Client'));

    const customerName = rawCustomerName
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

    const customerPhone = order.recipient_phone || order.customer_phone || shippingAddr?.phone || user.contactno || user.phone || 'N/A';
    const customerEmail = order.customer_email || user.emailid || 'houseofurvaah@gmail.com';

    // Format address components clearly
    const street = (order.full_address || shippingAddr?.address || shippingAddr?.street || shippingAddr?.addressLine1 || '').trim();
    const city = (order.city || shippingAddr?.city || '').trim();
    const state = (order.state || shippingAddr?.state || '').trim();
    const postalCode = (order.postal_code || shippingAddr?.pincode || shippingAddr?.postal_code || shippingAddr?.postalCode || '').trim();

    const cityStateZipParts = [city, state, postalCode ? `PIN: ${postalCode}` : ''].filter(p => p && String(p).trim().length > 0);
    const cityStatePin = cityStateZipParts.join(', ');

    let fullFormattedAddress = '';
    if (street && cityStatePin) {
        if (!street.toLowerCase().includes(city.toLowerCase())) {
            fullFormattedAddress = `${street}, ${cityStatePin}`;
        } else {
            fullFormattedAddress = street;
            if (postalCode && !street.includes(postalCode)) {
                fullFormattedAddress += ` - ${postalCode}`;
            }
        }
    } else {
        fullFormattedAddress = street || cityStatePin || 'India';
    }

    // 4. Financial Calculations
    // Subtotal represents the base amount of clothes
    const subtotal = parseFloat(order.subtotal || 0);
    const discountAmount = parseFloat(order.discount_amount || 0);
    const shippingFee = parseFloat(order.shipping || order.shipping_cost || 0);

    const netTaxable = Math.max(0, subtotal - discountAmount);
    const storeSettings = await settingsService.getSettings();
    
    // Determine tax rate: use order.tax if present, else apply dynamic GST settings
    let taxRate = 18;
    if (order.gst_applied === false) {
        taxRate = 0; // order placed while GST was switched off
    } else if (order.tax !== undefined && order.tax !== null && netTaxable > 0) {
        const computedRate = Math.round((parseFloat(order.tax) / netTaxable) * 100);
        if (computedRate > 0) {
            taxRate = computedRate;
        } else {
            const gstCalc = await settingsService.calculateGst(netTaxable, storeSettings);
            taxRate = gstCalc.rate;
        }
    } else {
        const gstCalc = await settingsService.calculateGst(netTaxable, storeSettings);
        taxRate = gstCalc.rate;
    }

    // Calculated tax amount
    const calculatedTax = order.gst_applied === false ? 0 : (order.tax !== undefined && order.tax !== null && parseFloat(order.tax) > 0)
        ? parseFloat(order.tax)
        : Math.round(netTaxable * (taxRate / 100));

    const baseTaxableValue = netTaxable;

    // Card processing surcharge detection
    const isCard = String(order.payment_method || '').toLowerCase().includes('card') || String(order.payment_type || '').toLowerCase().includes('card');
    const codChargeNum = Math.max(0, parseFloat(order.cod_charge || 0));
    let cardSurchargeNum = parseFloat(order.card_surcharge || order.cardSurcharge || 0);
    if (cardSurchargeNum <= 0 && isCard && order.total) {
        const orderTotal = parseFloat(order.total);
        const subtotalWithTax = baseTaxableValue + calculatedTax + shippingFee;
        if (orderTotal > subtotalWithTax) {
            cardSurchargeNum = Math.round(orderTotal - subtotalWithTax);
        }
    }
    const cardSurchargeRate = storeSettings.card_charge_percentage || 2;

    const grandTotalNum = order.total ? parseFloat(order.total) : (baseTaxableValue + calculatedTax + shippingFee + cardSurchargeNum);

    const customerState = String(order.state || shippingAddr?.state || '').trim().toLowerCase();
    const isDelhi = customerState.includes('delhi') || customerState === 'dl';
    const isInterState = !isDelhi;

    const cgstRate = isInterState ? 0 : (taxRate / 2);
    const sgstRate = isInterState ? 0 : (taxRate / 2);
    const igstRate = isInterState ? taxRate : 0;

    const cgstAmount = isInterState ? '0.00' : (calculatedTax / 2).toFixed(2);
    const sgstAmount = isInterState ? '0.00' : (calculatedTax / 2).toFixed(2);
    const igstAmount = isInterState ? calculatedTax.toFixed(2) : '0.00';

    const createdAt = new Date(order.created_at || Date.now());
    const issueDate = createdAt.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
    const orderDate = createdAt.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    const paymentMethodRaw = String(order.payment_method || 'Online').toUpperCase();
    const isCod = paymentMethodRaw === 'COD' || paymentMethodRaw.includes('CASH');
    const isDelivered = String(order.status || '').toLowerCase() === 'delivered';
    const paymentStatusRaw = (isCod && isDelivered) ? 'PAID' : String(order.payment_status || 'Paid').toUpperCase();
    const isPaid = paymentStatusRaw === 'PAID';

    // 5. Load the House of Urvaah logo as base64
    let logoBase64 = '';
    const possibleLogoPaths = [
        path.join(__dirname, "../assets/Logo.png"),
        path.join(__dirname, "../../house-of-urvaah-FE/public/assets/logo.png"),
        path.join(__dirname, "../../../house-of-urvaah-FE/public/assets/logo.png"),
        path.join(__dirname, "../../house-of-urvaah-FE/public/assets/brand-logo.png"),
        path.join(__dirname, "../assets/brand-logo.png")
    ];

    for (const logoPath of possibleLogoPaths) {
        try {
            if (fs.existsSync(logoPath)) {
                const logoBuffer = fs.readFileSync(logoPath);
                const ext = path.extname(logoPath).toLowerCase() === '.jpg' ? 'jpeg' : 'png';
                logoBase64 = `data:image/${ext};base64,${logoBuffer.toString('base64')}`;
                break;
            }
        } catch (err) {
            // continue search
        }
    }

    // 6. Map order items
    const rawItems = Array.isArray(order.items) ? order.items : [];
    const items = rawItems.map((item, index) => {
        const itemPrice = parseFloat(item.price || 0);
        const qty = parseInt(item.quantity || 1, 10);
        const lineTotal = itemPrice * qty;
        const lineTaxable = lineTotal;

        return {
            index: index + 1,
            name: item.name || item.title || 'Haute Couture Ensemble',
            sku: item.product_id ? `URV-HC-${String(item.product_id).padStart(4, '0')}` : `URV-AT-${index + 1}`,
            size: item.size || item.selectedSize || 'M',
            color: item.color || 'Signature Hue',
            hsn: '6204',
            quantity: qty,
            price: itemPrice.toFixed(2),
            taxableValue: lineTaxable.toFixed(2),
            gstRate: `${taxRate}%`,
            total: lineTotal.toFixed(2)
        };
    });

    const currencySymbol = getCurrencySymbol();

    // Resolve authoritative Invoice Number in format YYyyMM<seq> (e.g. 26271001, 26271002)
    let finalInvoiceNumber = order.invoice_number;
    const yr = createdAt.getFullYear();
    const moNum = createdAt.getMonth() + 1;
    const sYr = moNum >= 4 ? yr : yr - 1;
    const eYr = moNum >= 4 ? yr + 1 : yr;
    const sYr2 = String(sYr % 100).padStart(2, '0');
    const eYr2 = String(eYr % 100).padStart(2, '0');
    const fyPrefix = `${sYr2}${eYr2}`; // e.g. "2627"
    const moStr = String(moNum).padStart(2, '0'); // e.g. "10"

    // Convert legacy formats (e.g. 2026-2710156, HOU-202610156) if present
    if (finalInvoiceNumber) {
        const stripped = finalInvoiceNumber.replace(/^HOU-/, '');
        const fyMatch = stripped.match(/^(\d{2})?(\d{2})-(\d{2})(\d{2})(\d+)$/);
        if (fyMatch) {
            const rawSeq = fyMatch[5];
            const seqPadded = rawSeq.length === 1 ? `0${rawSeq}` : rawSeq;
            finalInvoiceNumber = `${fyMatch[2]}${fyMatch[3]}${fyMatch[4]}${seqPadded}`;
            if (order.id) {
                await pool.query('UPDATE orders SET invoice_number = $1 WHERE id = $2', [finalInvoiceNumber, order.id]).catch(() => {});
            }
        } else {
            const match = stripped.match(/^(\d{4})(\d{2})(\d+)$/);
            if (match) {
                const rawYr = parseInt(match[1], 10);
                const rawMo = parseInt(match[2], 10);
                const rawSeq = parseInt(match[3], 10);
                const rawSYr = rawMo >= 4 ? rawYr : rawYr - 1;
                const rawEYr = rawMo >= 4 ? rawYr + 1 : rawYr;
                const s2 = String(rawSYr % 100).padStart(2, '0');
                const e2 = String(rawEYr % 100).padStart(2, '0');
                finalInvoiceNumber = `${s2}${e2}${String(rawMo).padStart(2, '0')}${String(rawSeq).padStart(2, '0')}`;
                if (order.id) {
                    await pool.query('UPDATE orders SET invoice_number = $1 WHERE id = $2', [finalInvoiceNumber, order.id]).catch(() => {});
                }
            }
        }
    }

    if (!finalInvoiceNumber || !/^\d{8,}$/.test(finalInvoiceNumber)) {
        try {
            const seqRes = await pool.query(
                `SELECT COUNT(*) FROM orders 
                 WHERE date_trunc('month', created_at) = date_trunc('month', $1::timestamptz) 
                   AND (created_at < $1::timestamptz OR (created_at = $1::timestamptz AND id <= $2))`,
                [order.created_at || new Date(), order.id]
            );
            const seq = Math.max(1, parseInt(seqRes.rows[0]?.count || 1, 10));
            const seqStr = String(seq).padStart(2, '0');
            finalInvoiceNumber = `${fyPrefix}${moStr}${seqStr}`;
            if (order.id) {
                await pool.query('UPDATE orders SET invoice_number = $1 WHERE id = $2', [finalInvoiceNumber, order.id]).catch(() => {});
            }
        } catch (seqErr) {
            const digits = String(order.order_number || order.id || '').replace(/\D/g, '');
            const fallbackSeq = digits ? parseInt(digits.slice(-2), 10) || 1 : 1;
            const seqStr = String(fallbackSeq).padStart(2, '0');
            finalInvoiceNumber = `${fyPrefix}${moStr}${seqStr}`;
        }
    }

    return {
        currencySymbol,
        logoBase64,
        invoiceNumber: finalInvoiceNumber,
        orderId: order.order_number,
        orderNumber: order.order_number,
        orderDate,
        issueDate,
        placeOfSupply: 'Mumbai, India',
        stateCode: '27 (Maharashtra)',
        userName: customerName,
        userAddress: fullFormattedAddress,
        userStreet: street,
        userCityStatePin: cityStatePin,
        userPhone: customerPhone,
        userEmail: customerEmail,
        paymentMethod: paymentMethodRaw,
        paymentStatus: paymentStatusRaw,
        isPaid,
        paymentReference: order.razorpay_payment_id || order.payment_reference || (isPaid ? `TXN-${String(order.id).slice(0, 8).toUpperCase()}` : 'Pending Settlement'),
        items,
        totalItemsCount: items.reduce((acc, it) => acc + it.quantity, 0),
        subtotal: subtotal.toFixed(2),
        baseTaxableValue: baseTaxableValue.toFixed(2),
        shippingFee: shippingFee.toFixed(2),
        shippingFeeText: shippingFee === 0 ? 'Complimentary White-Glove (₹0.00)' : `${currencySymbol}${shippingFee.toFixed(2)}`,
        hasDiscount: discountAmount > 0,
        couponCode: order.coupon_code || '',
        discountAmount: discountAmount.toFixed(2),
        discountLabel: (order.coupon_code && (order.coupon_code.toUpperCase().includes('BOGO') || order.coupon_code.toUpperCase().includes('FREE')))
            ? 'Store Privilege / BOGO Offer'
            : (order.coupon_code ? `Promotional Privilege (${order.coupon_code})` : 'Privilege Savings'),
        taxRate: taxRate,
        isInterState,
        cgstRate,
        sgstRate,
        igstRate,
        cgstAmount,
        sgstAmount,
        igstAmount,
        taxAmount: calculatedTax.toFixed(2),
        hasCodCharge: codChargeNum > 0,
        codCharge: codChargeNum.toFixed(2),
        hasCardSurcharge: cardSurchargeNum > 0,
        cardSurcharge: cardSurchargeNum.toFixed(2),
        cardSurchargeRate: cardSurchargeRate,
        grandTotal: grandTotalNum.toFixed(2),
        amountInWords: numberToWords(grandTotalNum),
        authSignatoryDate: issueDate
    };
};

/**
 * Generates the HTML content for an invoice based on order ID.
 * @param {string|number} orderId - The database ID of the order.
 * @returns {Promise<string>} - Compiled HTML string.
 */
exports.generateInvoiceHTML = async (orderId, options = {}) => {
    const templateData = await exports.getInvoiceData(orderId, options);

    const templatePath = path.join(__dirname, '../templates/invoiceTemplate.html');
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Invoice template not found at ${templatePath}`);
    }

    const source = fs.readFileSync(templatePath, 'utf-8');
    const template = handlebars.compile(source);
    return template(templateData);
};

/**
 * Generates a PDF buffer from an order ID.
 * @param {string|number} orderId - The database ID of the order.
 * @returns {Promise<Buffer>} - PDF binary data.
 */
exports.generateInvoicePDF = async (orderId, options = {}) => {
    const html = await exports.generateInvoiceHTML(orderId, options);

    let browser;
    try {
        const puppeteer = require('puppeteer-core');
        const chromium = require('@sparticuz/chromium');
        const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;

        let executablePath = null;
        if (isProd) {
            executablePath = await chromium.executablePath();
        } else {
            const possiblePaths = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
                process.env.CHROME_BIN,
                process.env.PUPPETEER_EXECUTABLE_PATH
            ].filter(Boolean);

            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    executablePath = p;
                    break;
                }
            }
        }

        browser = await puppeteer.launch({
            args: isProd ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
            defaultViewport: chromium.defaultViewport || { width: 1200, height: 800 },
            executablePath: executablePath || (isProd ? await chromium.executablePath() : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'),
            headless: isProd ? chromium.headless : 'new',
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            margin: {
                top: '0mm',
                bottom: '0mm',
                left: '0mm',
                right: '0mm'
            }
        });

        return pdfBuffer;
    } catch (error) {
        console.error('PDF Generation Error:', error);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
};
