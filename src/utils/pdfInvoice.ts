import { jsPDF } from 'jspdf';
import { SaleBill, StoreSettings } from '../types/pharmacy';

export function createInvoicePDF(bill: SaleBill, settings: StoreSettings): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  let y = 40;

  // Header Banner
  doc.setFillColor(0, 105, 92); // Teal #00695c
  doc.rect(margin, y, contentWidth, 54, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(settings.storeName || 'DRUGS LITES PHARMA', margin + 14, y + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(settings.tagline || 'Retail Pharmacy & Medical Store POS', margin + 14, y + 42);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(settings.gstin ? 'RETAIL TAX INVOICE' : 'RETAIL SALES INVOICE', pageWidth - margin - 14, y + 24, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const licenseDetails = [
    settings.dl20b && `Form 20B: ${settings.dl20b}`,
    settings.dl21b && `Form 21B: ${settings.dl21b}`,
  ].filter(Boolean).join(' | ');
  if (licenseDetails) {
    doc.text(licenseDetails, pageWidth - margin - 14, y + 40, { align: 'right' });
  }

  y += 66;

  // Store & Tax Details Bar
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(8);
  const storeAddress = [settings.addressLine1, settings.addressLine2, settings.city, settings.state, settings.pincode]
    .filter(Boolean)
    .join(', ');
  if (storeAddress) doc.text(storeAddress, margin, y);
  const contactDetails = [
    settings.phone && `Phone: ${settings.phone}`,
    settings.email && `Email: ${settings.email}`,
  ].filter(Boolean).join(' | ');
  if (contactDetails) doc.text(contactDetails, margin, y + 11);
  const taxDetails = [
    settings.gstin && `GSTIN: ${settings.gstin}`,
    settings.pan && `PAN: ${settings.pan}`,
  ].filter(Boolean).join(' | ');
  if (taxDetails) doc.text(taxDetails, pageWidth - margin, y, { align: 'right' });

  y += 24;

  // Divider Line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 12;

  // Invoice & Customer Info Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 52, 4, 4, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 52, 4, 4, 'S');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  // Left Column
  doc.text(`Invoice No:`, margin + 10, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(`${bill.billNumber}`, margin + 65, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.text(`Date & Time:`, margin + 10, y + 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${bill.timestamp}`, margin + 65, y + 32);

  doc.setFont('helvetica', 'bold');
  doc.text(`Cashier / Reg:`, margin + 10, y + 46);
  doc.setFont('helvetica', 'normal');
  doc.text(`${bill.cashierName}`, margin + 65, y + 46);

  // Middle Column
  const midX = margin + contentWidth * 0.42;
  doc.setFont('helvetica', 'bold');
  doc.text(`Patient Name:`, midX, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(`${bill.customerName || 'Walk-in Retail Patient'}`, midX + 68, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.text(`Mobile:`, midX, y + 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${bill.customerPhone || 'N/A'}`, midX + 68, y + 32);

  doc.setFont('helvetica', 'bold');
  doc.text(`Payment:`, midX, y + 46);
  doc.setFont('helvetica', 'normal');
  doc.text(`${bill.paymentMethod} ${bill.paymentRef ? `(Ref: ${bill.paymentRef})` : ''}`, midX + 68, y + 46);

  // Right Column
  const rightX = margin + contentWidth * 0.74;
  doc.setFont('helvetica', 'bold');
  doc.text(`Doctor:`, rightX, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(`${bill.doctorName || 'General / Self'}`, rightX + 42, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.text(`Reg No:`, rightX, y + 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${bill.doctorRegNo || 'N/A'}`, rightX + 42, y + 32);

  y += 64;

  // Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 20, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 20, 'S');

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  const colX = {
    sno: margin + 8,
    name: margin + 28,
    batch: margin + 195,
    exp: margin + 255,
    qty: margin + 305,
    mrp: margin + 345,
    disc: margin + 395,
    gst: margin + 440,
    amt: pageWidth - margin - 8,
  };

  doc.text('#', colX.sno, y + 13);
  doc.text('Medicine & Composition', colX.name, y + 13);
  doc.text('Batch', colX.batch, y + 13);
  doc.text('Exp', colX.exp, y + 13);
  doc.text('Qty/Pk/Unit', colX.qty, y + 13, { align: 'center' });
  doc.text('MRP (₹)', colX.mrp, y + 13, { align: 'right' });
  doc.text('Disc%', colX.disc, y + 13, { align: 'right' });
  doc.text('GST%', colX.gst, y + 13, { align: 'right' });
  doc.text('Amount (₹)', colX.amt, y + 13, { align: 'right' });

  y += 20;

  // Table Items
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  bill.items.forEach((item, index) => {
    // Check if new page needed
    if (y > pageHeight - 140) {
      doc.addPage();
      y = 40;
    }

    const rowHeight = 22;
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, rowHeight, 'F');
    }

    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);

    doc.setTextColor(71, 85, 105);
    doc.text(`${index + 1}`, colX.sno, y + 13);

    // Brand name & generic
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`${item.brandName} ${item.strength ? `(${item.strength})` : ''}`, colX.name, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`${item.genericName.slice(0, 26)} • HSN:${item.hsnCode || 'Not provided'}`, colX.name, y + 19);
    doc.setFontSize(8);

    doc.setTextColor(51, 65, 85);
    doc.text(`${item.batchNumber}`, colX.batch, y + 13);
    doc.text(`${item.expiryDate}`, colX.exp, y + 13);
    const quantityUnit = item.dispenseMode === 'loose'
      ? (item.dosageForm === 'Tablet' ? 'tabs' : item.dosageForm === 'Capsule' ? 'capsules' : 'units')
      : (item.packUnit || 'packs');
    doc.text(`${item.quantity} ${quantityUnit}`, colX.qty, y + 13, { align: 'center' });
    doc.text(`${item.mrp.toFixed(2)}`, colX.mrp, y + 13, { align: 'right' });
    doc.text(`${item.discountPercent}%`, colX.disc, y + 13, { align: 'right' });
    doc.text(`${item.gstRate}%`, colX.gst, y + 13, { align: 'right' });

    const itemTotal = item.quantity * item.mrp * (1 - item.discountPercent / 100);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${itemTotal.toFixed(2)}`, colX.amt, y + 13, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    y += rowHeight;
  });

  y += 10;

  // Financial Summary Box
  const summaryWidth = 220;
  const summaryX = pageWidth - margin - summaryWidth;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(summaryX, y, summaryWidth, 105, 4, 4, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(summaryX, y, summaryWidth, 105, 4, 4, 'S');

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);

  let sumY = y + 14;
  doc.text('Subtotal (Gross MRP):', summaryX + 12, sumY);
  doc.text(`₹${bill.subtotal.toFixed(2)}`, pageWidth - margin - 12, sumY, { align: 'right' });

  sumY += 13;
  doc.text('Discount Allowed:', summaryX + 12, sumY);
  doc.setTextColor(22, 101, 52); // green
  doc.text(`- ₹${bill.totalDiscount.toFixed(2)}`, pageWidth - margin - 12, sumY, { align: 'right' });

  sumY += 13;
  doc.setTextColor(71, 85, 105);
  doc.text('Taxable Amount (after discount):', summaryX + 12, sumY);
  doc.text(`₹${bill.taxableAmount.toFixed(2)}`, pageWidth - margin - 12, sumY, { align: 'right' });

  sumY += 13;
  doc.text('GST (CGST + SGST):', summaryX + 12, sumY);
  doc.text(`₹${(bill.cgstAmount + bill.sgstAmount).toFixed(2)}`, pageWidth - margin - 12, sumY, { align: 'right' });

  sumY += 13;
  doc.text('Round Off:', summaryX + 12, sumY);
  doc.text(`₹${bill.roundOff.toFixed(2)}`, pageWidth - margin - 12, sumY, { align: 'right' });

  sumY += 16;
  doc.setDrawColor(203, 213, 225);
  doc.line(summaryX + 10, sumY - 4, pageWidth - margin - 10, sumY - 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 105, 92); // Teal
  doc.text('NET PAYABLE:', summaryX + 12, sumY + 5);
  doc.text(`₹${bill.netPayable.toFixed(2)}`, pageWidth - margin - 12, sumY + 5, { align: 'right' });

  // Left Note & Statutory
  const noteX = margin;
  const noteWidth = contentWidth - summaryWidth - 20;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Prescription verification:', noteX, y + 14);
  doc.text(
    bill.isPrescriptionVerified
      ? `${bill.pharmacistName || bill.cashierName} (Reg. ${bill.pharmacistRegNo || 'not recorded'})`
      : 'Not recorded',
    noteX,
    y + 25
  );

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(`Dispensed by: ${bill.cashierName}`, noteX, y + 52);

  // Bottom Signature & Thank You
  y += 105;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Thank you for choosing DRUGS LITES PHARMA. Wishing you good health!', margin, y + 14);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 105, 92);
  doc.text('Pharmacy representative', pageWidth - margin, y + 14, { align: 'right' });

  return doc;
}

export function downloadInvoicePDF(bill: SaleBill, settings: StoreSettings): void {
  const doc = createInvoicePDF(bill, settings);
  doc.save(`Invoice_${bill.billNumber}.pdf`);
}
