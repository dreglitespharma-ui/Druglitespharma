/**
 * WhatsApp Direct Invoice Dispatch Service
 * Sends clean, formatted, comprehensive digital receipts directly to customer WhatsApp
 * ZERO file downloading, ZERO drag-and-drop required.
 */

import { SaleBill, StoreSettings } from '../types/pharmacy';

/**
 * Clean & normalize phone number for WhatsApp wa.me link
 * Handles Indian 10-digit mobiles, 11-digit numbers with leading 0, and international formats.
 */
export const formatWhatsAppPhoneNumber = (rawPhone: string): string => {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';
  
  // Standard Indian 10-digit mobile number
  if (digits.length === 10) {
    return `91${digits}`;
  }
  // 11 digits starting with 0 (e.g. 09845012345)
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  // Already prefixed with 91 (12 digits)
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  // If more than 10 digits, take trailing 10 digits prefixed by 91
  if (digits.length > 10) {
    return `91${digits.slice(-10)}`;
  }
  return digits;
};

/**
 * Formats a professional, tax-compliant pharmacy digital invoice in WhatsApp markdown
 */
export const generateWhatsAppInvoiceText = (bill: SaleBill, settings: StoreSettings): string => {
  const line = '━━━━━━━━━━━━━━━━━━━━━━━━';
  let text = `🏥 *${(settings?.storeName || 'DRUGS LITES PHARMA').toUpperCase()}*\n`;
  const fullAddress = [
    settings?.addressLine1,
    settings?.addressLine2,
    settings?.city,
    settings?.state,
    settings?.pincode,
  ].filter(Boolean).join(', ');
  if (fullAddress) text += `📍 ${fullAddress}\n`;
  if (settings?.phone) text += `📞 Phone: ${settings.phone}\n`;
  if (settings?.gstin) text += `🏷️ GSTIN: ${settings.gstin}\n`;
  if (settings?.dl20b || settings?.dl21b) {
    text += `📜 Drug Lic: ${settings.dl20b || ''}${settings.dl20b && settings.dl21b ? ' / ' : ''}${settings.dl21b || ''}\n`;
  }
  text += `${line}\n`;
  text += `🧾 *TAX INVOICE / CASH MEMO*\n`;
  text += `*Invoice No:* #${bill.billNumber || 'BILL'}\n`;
  text += `*Date & Time:* ${bill.timestamp || new Date().toLocaleString()}\n`;
  text += `*Customer:* ${bill.customerName || 'Walk-in Customer'}\n`;
  if (bill.customerPhone) text += `*Mobile:* +91 ${bill.customerPhone.replace(/\D/g, '').slice(-10)}\n`;
  if (bill.doctorName) text += `*Prescribed By:* ${bill.doctorName}\n`;
  text += `*Dispensed By:* ${bill.cashierName || 'Pharmacist'}\n`;
  text += `${line}\n`;
  text += `*MEDICINES DISPENSED:*\n\n`;

  (bill.items || []).forEach((item, idx) => {
    const discPct = item.discountPercent || 0;
    const price = Number(item.mrp || 0);
    const qty = Number(item.quantity || 1);
    const quantityUnit = item.dispenseMode === 'loose'
      ? (item.dosageForm === 'Tablet' ? 'tabs' : item.dosageForm === 'Capsule' ? 'capsules' : 'units')
      : (item.packUnit || 'packs');
    const lineTotal = qty * price * (1 - discPct / 100);
    const gstRateDisplay = item.gstRate === 0 ? '0% Exempt' : `${item.gstRate ?? 12}%`;

    text += `${idx + 1}. *${item.brandName}* [${item.dosageForm || 'Unit'}]\n`;
    text += `   Batch: ${item.batchNumber || 'N/A'} | Exp: ${item.expiryDate || 'N/A'}\n`;
    text += `   Qty: *${qty} ${quantityUnit}* × ₹${price.toFixed(2)}`;
    if (discPct > 0) {
      text += ` (${discPct}% Disc)`;
    }
    text += ` | GST: ${gstRateDisplay}\n`;
    text += `   Subtotal: *₹${lineTotal.toFixed(2)}*\n\n`;
  });

  text += `${line}\n`;
  text += `*BILL SUMMARY:*\n`;
  text += `• Total MRP: ₹${Number(bill.subtotal || 0).toFixed(2)}\n`;
  if (bill.totalDiscount && bill.totalDiscount > 0) {
    text += `• Discount Savings: -₹${Number(bill.totalDiscount).toFixed(2)}\n`;
  }
  text += `• Taxable Turnover: ₹${Number(bill.taxableAmount || 0).toFixed(2)}\n`;
  if ((bill.cgstAmount || 0) > 0 || (bill.sgstAmount || 0) > 0) {
    text += `• CGST: ₹${Number(bill.cgstAmount || 0).toFixed(2)} | SGST: ₹${Number(bill.sgstAmount || 0).toFixed(2)}\n`;
  } else {
    text += `• GST Applied: ₹0.00 (Nil / Exempt Items)\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `*💰 NET PAYABLE: ₹${Number(bill.netPayable || 0).toFixed(2)}*\n`;
  text += `• Payment Mode: *${bill.paymentMethod || 'Cash'}*`;
  if (bill.paymentRef) text += ` (Ref: ${bill.paymentRef})`;
  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (bill.isPrescriptionVerified) {
    text += `✅ *Prescription verified by Registered Pharmacist (D&C Act Rule 65)*\n`;
  }
  text += `💊 *Storage Instructions:* Store in a cool, dry place away from direct sunlight.\n`;
  text += `🙏 *Thank you for choosing ${settings?.storeName || 'DRUGS LITES PHARMA'}! Wish you sound health and speedy recovery!*`;

  return text;
};

/**
 * Directly dispatches the complete digital invoice to the customer on WhatsApp.
 * Opens wa.me directly without downloading any file or requiring drag-and-drop.
 */
export const sendDirectWhatsAppInvoice = (
  bill: SaleBill,
  settings: StoreSettings,
  phoneOverride?: string
): { success: boolean; phone: string; error?: string } => {
  const targetPhone = (phoneOverride || bill.customerPhone || '').trim();
  const formattedPhone = formatWhatsAppPhoneNumber(targetPhone);

  if (!formattedPhone || formattedPhone.length < 10) {
    return {
      success: false,
      phone: targetPhone,
      error: 'Please provide a valid 10-digit customer mobile number.',
    };
  }

  const messageText = generateWhatsAppInvoiceText(bill, settings);
  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(messageText)}`;

  // Directly trigger link
  try {
    const link = document.createElement('a');
    link.href = waUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    window.open(waUrl, '_blank');
  }

  return {
    success: true,
    phone: formattedPhone,
  };
};
