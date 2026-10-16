const fs = require('fs');
const path = require('path');
const orderService = require('./orderService');

// Code 128 Pattern Table (Patterns 0 - 106, 106 is Stop)
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

/**
 * Generates an SVG string representation of a Code 128 (Type B) Barcode.
 * Pure vector, 100% crisp at any resolution or thermal printer DPI.
 */
function generateBarcodeSVG(rawText, height = 55, barUnitWidth = 2) {
  const text = String(rawText || '').trim();
  if (!text) return '';

  const codes = [104]; // Code 128B start code
  let checksum = 104;

  for (let i = 0; i < text.length; i++) {
    const ascii = text.charCodeAt(i);
    // Code 128B maps ASCII 32..126 to 0..94
    const code = (ascii >= 32 && ascii <= 126) ? (ascii - 32) : 0;
    codes.push(code);
    checksum += code * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop code

  let currentX = 8;
  const rects = [];

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    let isBar = true;
    for (let p = 0; p < pattern.length; p++) {
      const w = parseInt(pattern[p], 10) * barUnitWidth;
      if (isBar) {
        rects.push(`<rect x="${currentX}" y="0" width="${w}" height="${height}" fill="#000000" />`);
      }
      currentX += w;
      isBar = !isBar;
    }
  }

  const totalWidth = currentX + 8;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet" style="display:block; margin: 0 auto;">
      ${rects.join('')}
    </svg>
  `.trim();
}

/**
 * Retrieves and prepares rich normalized shipping label data for an order or tracking identifier.
 */
async function getShippingLabelData(identifier, isReturn = false) {
  if (!identifier) {
    throw new Error('Order or tracking identifier is required to generate shipping label.');
  }

  const order = await orderService.getOrderById(identifier);
  if (!order) {
    throw new Error(`Order or shipment not found for identifier: "${identifier}".`);
  }

  // Determine AWB / tracking number
  let awb = order.tracking_number || order.awb_code;
  if (!awb) {
    // Generate deterministic clean AWB if not yet assigned by Shiprocket
    const cleanNum = String(order.order_number || order.id).replace(/\D/g, '').padEnd(9, '8').slice(0, 9);
    awb = `URV${cleanNum}IN`;
  }

  const orderNumber = order.order_number || String(order.id).slice(0, 8).toUpperCase();
  const isCod = (order.payment_method || '').toLowerCase() === 'cod' ||
                (order.payment_type || '').toLowerCase() === 'cod' ||
                (order.payment_method || '').toLowerCase().includes('cash');

  const totalAmount = parseFloat(order.total || order.subtotal || 0).toFixed(2);
  const paymentBadge = isCod ? 'CASH ON DELIVERY (COD)' : 'PREPAID';
  const collectableAmountText = isCod ? `₹${Number(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00 (DO NOT COLLECT CASH)';

  // Customer / Destination Info
  const consigneeName = order.recipient_name || order.customer_name || 'Valued Atelier Patron';
  const phone = order.recipient_phone || order.customer_phone || order.phone || 'N/A';
  const street = (order.full_address || order.address || '').trim() || 'Address on file';
  const city = (order.city || 'Mumbai').trim();
  const state = (order.state || 'Maharashtra').trim();
  const pincode = String(order.postal_code || order.pincode || '400001').trim();
  const hubCode = `${city.slice(0, 3).toUpperCase()}/${pincode}`;

  // Seller / Dispatch Origin (House of Urvaah Central Atelier)
  const sellerInfo = {
    name: 'HOUSE OF URVAAH (Urvaah Luxury Retails Pvt. Ltd.)',
    address: 'Central Atelier & Fulfillment Hub, Plot 18, Phase 2, Industrial Estate, Andheri East',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400093',
    country: 'India',
    gstin: '27AABCH1234F1Z5',
    contact: 'concierge@houseofurvaah.com | +91 91520 00000'
  };

  const courierName = order.courier_name || 'Delhivery Express Surface & Air';
  const orderDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  const invoiceRef = order.invoice_number || `HOU-${new Date().getFullYear()}${orderNumber}`;

  const items = (order.items || []).map((it, idx) => ({
    index: idx + 1,
    title: it.name || it.title || 'Haute Couture Ensemble',
    sku: it.sku || (it.product_id ? `URV-SKU-${it.product_id}` : `URV-ITEM-${idx + 1}`),
    size: it.size || 'Free',
    color: it.color || 'Signature',
    quantity: it.quantity || 1,
    price: parseFloat(it.price || 0).toFixed(2)
  }));

  const awbBarcodeSvg = generateBarcodeSVG(awb, 58, 2);
  const orderBarcodeSvg = generateBarcodeSVG(orderNumber, 36, 1.8);

  return {
    orderId: order.id,
    orderNumber,
    awb,
    isReturn,
    courierName,
    hubCode,
    isCod,
    paymentBadge,
    collectableAmountText,
    totalAmount,
    consignee: {
      name: consigneeName,
      phone,
      street,
      city,
      state,
      pincode
    },
    seller: sellerInfo,
    weight: '0.50 KG',
    dimensions: '15 x 12 x 6 CM',
    orderDate,
    invoiceRef,
    items,
    awbBarcodeSvg,
    orderBarcodeSvg
  };
}

/**
 * Builds standard 4" x 6" (100mm x 150mm) thermal shipping label HTML.
 */
async function generateShippingLabelHTML(identifier, options = {}) {
  const isReturn = Boolean(options.isReturn);
  const data = await getShippingLabelData(identifier, isReturn);

  const shipTo = isReturn ? data.seller : data.consignee;
  const shipFrom = isReturn ? data.consignee : data.seller;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shipping Label - ${data.awb} - House of Urvaah</title>
  <style>
    @page {
      size: 100mm 150mm;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      min-height: 100vh;
    }
    .toolbar {
      width: 100%;
      max-width: 420px;
      margin: 12px auto;
      display: flex;
      gap: 10px;
      justify-content: center;
      padding: 8px 12px;
      background: #18181b;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .toolbar button {
      background: #ffffff;
      color: #18181b;
      border: none;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }
    .toolbar button:hover {
      background: #f4f4f5;
    }
    .toolbar button.btn-secondary {
      background: #27272a;
      color: #fafafa;
    }
    .toolbar button.btn-secondary:hover {
      background: #3f3f46;
    }
    .label-page {
      width: 100mm;
      min-height: 150mm;
      max-width: 100mm;
      background: #ffffff;
      border: 2px solid #000000;
      margin: 0 auto 30px auto;
      padding: 3mm 4mm;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      font-size: 11px;
      line-height: 1.25;
    }
    @media print {
      body {
        background: transparent !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .toolbar {
        display: none !important;
      }
      .label-page {
        margin: 0 !important;
        border: 2px solid #000000 !important;
        box-shadow: none !important;
        width: 100mm !important;
        height: 150mm !important;
        page-break-after: always;
      }
    }
    .brand-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000;
      padding-bottom: 4px;
      margin-bottom: 4px;
    }
    .brand-name {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    .carrier-badge {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      border: 1.5px solid #000;
      padding: 1px 6px;
      border-radius: 3px;
    }
    .awb-section {
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 4px;
      margin-bottom: 4px;
    }
    .awb-text {
      font-family: "Courier New", Courier, monospace;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 2px;
      margin-top: 3px;
    }
    .routing-payment-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 2px solid #000;
      margin-bottom: 4px;
    }
    .routing-box {
      border-right: 2px solid #000;
      padding: 4px 6px 4px 2px;
    }
    .routing-label {
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 700;
      color: #333;
    }
    .routing-hub {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 1px;
    }
    .payment-box {
      padding: 4px 2px 4px 6px;
      background: ${data.isCod ? '#000000' : '#ffffff'};
      color: ${data.isCod ? '#ffffff' : '#000000'};
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .payment-mode-title {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .payment-amount {
      font-size: 13px;
      font-weight: 900;
      margin-top: 2px;
    }
    .addresses-grid {
      border-bottom: 2px solid #000;
      padding-bottom: 4px;
      margin-bottom: 4px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .address-card {
      font-size: 10px;
    }
    .address-card strong {
      font-size: 11px;
      display: block;
      margin-bottom: 1px;
    }
    .ship-to-box {
      border: 1.5px solid #000;
      padding: 4px 6px;
      border-radius: 4px;
      background: #fafafa;
    }
    .ship-to-header {
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dashed #666;
      padding-bottom: 2px;
      margin-bottom: 3px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      margin-bottom: 4px;
      border-bottom: 1.5px solid #000;
    }
    .items-table th {
      border-bottom: 1px solid #000;
      text-align: left;
      padding: 2px 2px;
      text-transform: uppercase;
      font-size: 8px;
    }
    .items-table td {
      padding: 2px 2px;
      border-bottom: 1px dotted #ccc;
    }
    .package-meta {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      font-size: 8.5px;
      border-bottom: 1.5px solid #000;
      padding-bottom: 3px;
      margin-bottom: 4px;
      text-align: center;
    }
    .meta-item span {
      display: block;
      color: #555;
      font-size: 7.5px;
      text-transform: uppercase;
    }
    .meta-item strong {
      font-size: 9px;
    }
    .footer-barcodes {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: auto;
      padding-top: 3px;
    }
    .order-barcode-wrapper {
      width: 60%;
      text-align: left;
    }
    .order-barcode-text {
      font-family: monospace;
      font-size: 9px;
      font-weight: 800;
    }
    .verification-box {
      width: 35%;
      border: 1px solid #000;
      padding: 2px 4px;
      text-align: center;
      font-size: 8px;
    }
  </style>
</head>
<body>

  <!-- In-Browser Print & Save Controls (hidden when printing) -->
  <div class="toolbar">
    <button onclick="window.print()">
      🖨️ Print Label
    </button>
    <button class="btn-secondary" onclick="window.location.href='?format=pdf'">
      ⬇️ Download PDF
    </button>
  </div>

  <!-- Physical 4" x 6" Shipping Label -->
  <div class="label-page">
    <!-- Brand & Courier Header -->
    <div class="brand-header">
      <div class="brand-name">House of Urvaah</div>
      <div class="carrier-badge">${data.courierName}</div>
    </div>

    <!-- Primary AWB & Barcode -->
    <div class="awb-section">
      <div class="barcode-container">
        ${data.awbBarcodeSvg}
      </div>
      <div class="awb-text">AWB: ${data.awb}</div>
    </div>

    <!-- Destination Routing Hub & Payment Indicator -->
    <div class="routing-payment-grid">
      <div class="routing-box">
        <div class="routing-label">Destination Hub / PIN</div>
        <div class="routing-hub">${data.hubCode}</div>
      </div>
      <div class="payment-box">
        <div class="payment-mode-title">${data.paymentBadge}</div>
        <div class="payment-amount">${data.collectableAmountText}</div>
      </div>
    </div>

    <!-- Addresses -->
    <div class="addresses-grid">
      <!-- SHIP TO (Consignee) -->
      <div class="ship-to-box address-card">
        <div class="ship-to-header">
          <span>${isReturn ? 'RETURN REVERSE PICKUP CONSIGNOR' : 'SHIP TO (CONSIGNEE)'}</span>
          <span>PIN: ${shipTo.pincode}</span>
        </div>
        <strong>${shipTo.name}</strong>
        <div>${shipTo.street || ''}</div>
        <div>${shipTo.city}, ${shipTo.state} - <strong>${shipTo.pincode}</strong></div>
        <div style="margin-top: 2px;"><strong>Contact Phone:</strong> ${shipTo.phone}</div>
      </div>

      <!-- DISPATCHED FROM / RETURN TO -->
      <div class="address-card" style="padding: 2px 4px; font-size: 8.5px; color: #333;">
        <span style="font-size: 7.5px; text-transform: uppercase; font-weight: 700; color: #666; display: block;">
          ${isReturn ? 'RETURN DESTINATION ATELIER:' : 'DISPATCHED & SOLD BY:'}
        </span>
        <strong>${shipFrom.name}</strong>, ${shipFrom.address}, ${shipFrom.city}, ${shipFrom.state} - ${shipFrom.pincode}.
        ${shipFrom.gstin ? `GSTIN: ${shipFrom.gstin}` : ''}
      </div>
    </div>

    <!-- Package Metadata -->
    <div class="package-meta">
      <div class="meta-item">
        <span>Order Number</span>
        <strong>#${data.orderNumber}</strong>
      </div>
      <div class="meta-item">
        <span>Weight / Vol</span>
        <strong>${data.weight}</strong>
      </div>
      <div class="meta-item">
        <span>Order Date</span>
        <strong>${data.orderDate}</strong>
      </div>
    </div>

    <!-- Order Items Summary Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 15px;">#</th>
          <th>Garment / Item Description</th>
          <th style="width: 35px;">Size</th>
          <th style="width: 25px; text-align: right;">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${data.items.slice(0, 4).map(it => `
          <tr>
            <td>${it.index}</td>
            <td><strong>${it.title}</strong><br/><span style="color:#666; font-size:7.5px;">SKU: ${it.sku}</span></td>
            <td>${it.size}</td>
            <td style="text-align: right;">${it.quantity}</td>
          </tr>
        `).join('')}
        ${data.items.length > 4 ? `
          <tr>
            <td colspan="4" style="text-align: center; color: #666; font-style: italic;">
              + ${data.items.length - 4} more item(s) in this package
            </td>
          </tr>
        ` : ''}
      </tbody>
    </table>

    <!-- Footer Barcodes & Handover Verification -->
    <div class="footer-barcodes">
      <div class="order-barcode-wrapper">
        ${data.orderBarcodeSvg}
        <div class="order-barcode-text">ORDER #${data.orderNumber}</div>
      </div>
      <div class="verification-box">
        <div style="font-weight: 900; text-transform: uppercase;">VERIFIED</div>
        <div>HOUSE OF URVAAH</div>
        <div style="font-size: 7px; color: #555;">ATELIER DISPATCH</div>
      </div>
    </div>
  </div>

</body>
</html>`;
}

/**
 * Generates an authoritative binary PDF Buffer for the 4" x 6" Shipping Label.
 */
async function generateShippingLabelPDF(identifier, options = {}) {
  const html = await generateShippingLabelHTML(identifier, options);

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
      defaultViewport: { width: 420, height: 620 },
      executablePath: executablePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: isProd ? chromium.headless : 'new'
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Standard 4" x 6" (100mm x 150mm) label dimensions
    const pdfBuffer = await page.pdf({
      width: '100mm',
      height: '150mm',
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
    console.error('[ShippingLabelService PDF Generation Error]:', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Builds Courier Pickup & Handover Manifest HTML document.
 */
async function generateManifestHTML(identifier) {
  const order = await orderService.getOrderById(identifier);
  if (!order) {
    throw new Error(`Order not found for manifest identifier: "${identifier}".`);
  }

  const awb = order.tracking_number || order.awb_code || `URV${String(order.order_number || order.id).replace(/\D/g, '').slice(0, 9)}IN`;
  const orderNumber = order.order_number || String(order.id).slice(0, 8);
  const now = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Courier Pickup Manifest - House of Urvaah</title>
  <style>
    body { font-family: sans-serif; padding: 25px; color: #111; max-width: 800px; margin: 0 auto; }
    .header { border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    h1 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1px; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
    th { background: #f4f4f5; text-transform: uppercase; font-size: 11px; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; }
    .sig-box { border-top: 1px solid #000; padding-top: 8px; font-size: 12px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 15px;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #000; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
      🖨️ Print Manifest
    </button>
  </div>
  <div class="header">
    <div>
      <h1>House of Urvaah - Courier Handover Manifest</h1>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">Fulfillment Center: Central Atelier, Andheri East, Mumbai</p>
    </div>
    <div style="text-align: right; font-size: 12px;">
      <div><strong>Date:</strong> ${now}</div>
      <div><strong>Courier:</strong> ${order.courier_name || 'Delhivery / Blue Dart'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Sr.</th>
        <th>AWB / Tracking #</th>
        <th>Order Ref</th>
        <th>Recipient & City</th>
        <th>Payment</th>
        <th>Declared Value</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td><strong>${awb}</strong></td>
        <td>#${orderNumber}</td>
        <td>${order.recipient_name || 'Customer'} (${order.city || 'Mumbai'})</td>
        <td>${order.payment_method || 'Online'}</td>
        <td>₹${order.total || '0.00'}</td>
      </tr>
    </tbody>
  </table>

  <div class="signature-grid">
    <div class="sig-box">
      <strong>House of Urvaah Dispatch Executive</strong><br/>
      <span>Signature: __________________________</span><br/>
      <span style="font-size: 10px; color: #666;">Handed over in sealed tamper-proof luxury packaging.</span>
    </div>
    <div class="sig-box">
      <strong>Courier Pickup Rider / Agent</strong><br/>
      <span>Name & Signature: __________________________</span><br/>
      <span>Rider Phone: _______________________________</span>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates an authoritative Courier Manifest PDF Buffer.
 */
async function generateManifestPDF(identifier) {
  const html = await generateManifestHTML(identifier);
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
      defaultViewport: { width: 1000, height: 800 },
      executablePath: executablePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: isProd ? chromium.headless : 'new'
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
    });
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  generateBarcodeSVG,
  getShippingLabelData,
  generateShippingLabelHTML,
  generateShippingLabelPDF,
  generateManifestHTML,
  generateManifestPDF
};
