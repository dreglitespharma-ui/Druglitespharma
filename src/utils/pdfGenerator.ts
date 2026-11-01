import { jsPDF } from 'jspdf';
import { SaleBill, StoreSettings } from '../types/pharmacy';

export function generateInvoicePDF(bill: SaleBill, settings: StoreSettings): { doc: jsPDF; blob: Blob; url: string } {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Page dimensions
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header Box - Brand
  doc.setFillColor(0, 105, 92); // Deep Teal #00695c
  doc.rect(14, y, pageWidth - 28, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.storeName, 20, y + 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(settings.tagline || 'Medical Store Management & Point of Sale System', 20, y + 16);
  doc.text(`DL No: ${settings.dl20b} / ${settings.dl21b}  |  GSTIN: ${settings.gstin}`, 20, y + 21);

  y += 32;

  // Invoice & Store Details Strip
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('RETAIL TAX INVOICE', 14, y);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice No: ${bill.billNumber}`, 14, y + 5);
  doc.text(`Date & Time: ${bill.timestamp}`, 14, y + 10);
  doc.text(`Cashier / Dispenser: ${bill.cashierName}`, 14, y + 15);

  // Patient & Doctor Details (Right Side)
  doc.text(`Billed to: ${bill.customerName || 'Walk-in Customer'}`, pageWidth - 85, y + 5);
  doc.text(`Mobile: ${bill.customerPhone || 'N/A'}`, pageWidth - 85, y + 10);
  doc.text(`Doctor: ${bill.doctorName || 'Self / OTC'}`, pageWidth - 85, y + 15);

  y += 22;

  // Divider Line
  doc.setDrawColor(203, 213, 225);
  doc.line(14, y, pageWidth - 14, y);
  y += 5;

  // Items Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);

  doc.text('#', 17, y + 5.5);
  doc.text('Medicine / Salt Description', 25, y + 5.5);
  doc.text('Batch', 95, y + 5.5);
  doc.text('Exp', 115, y + 5.5);
  doc.text('Qty', 133, y + 5.5);
  doc.text('MRP (Rs)', 145, y + 5.5);
  doc.text('Disc%', 165, y + 5.5);
  doc.text('Total (Rs)', pageWidth - 18, y + 5.5, { align: 'right' });

  y += 9;

  // Items Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  bill.items.forEach((item, idx) => {
    if (y > 250) {
      doc.addPage();
      y = 15;
    }

    const lineTotal = item.quantity * item.mrp * (1 - item.discountPercent / 100);

    doc.setTextColor(71, 85, 105);
    doc.text((idx + 1).toString(), 17, y + 4);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(item.brandName, 25, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`${item.genericName} (${item.strength})`, 25, y + 8);

    doc.setTextColor(30, 41, 59);
    doc.text(item.batchNumber, 95, y + 5);
    doc.text(item.expiryDate, 115, y + 5);
    const quantityUnit = item.dispenseMode === 'loose'
      ? (item.dosageForm === 'Tablet' ? 'tabs' : item.dosageForm === 'Capsule' ? 'capsules' : 'units')
      : (item.packUnit || 'packs');
    doc.text(`${item.quantity} ${quantityUnit}`, 135, y + 5);
    doc.text(item.mrp.toFixed(2), 147, y + 5);
    doc.text(`${item.discountPercent}%`, 167, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(lineTotal.toFixed(2), pageWidth - 18, y + 5, { align: 'right' });

    y += 11;
    doc.setDrawColor(241, 245, 249);
    doc.line(14, y - 1, pageWidth - 14, y - 1);
  });

  y += 4;

  // Totals Section Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(pageWidth - 95, y, 81, 40, 2, 2, 'F');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  doc.text('Subtotal (MRP Gross):', pageWidth - 90, y + 7);
  doc.text(`Rs. ${bill.subtotal.toFixed(2)}`, pageWidth - 18, y + 7, { align: 'right' });

  doc.text('Discount Allowed:', pageWidth - 90, y + 14);
  doc.setTextColor(0, 121, 107);
  doc.text(`- Rs. ${bill.totalDiscount.toFixed(2)}`, pageWidth - 18, y + 14, { align: 'right' });

  doc.setTextColor(71, 85, 105);
  doc.text('GST (CGST + SGST):', pageWidth - 90, y + 21);
  doc.text(`+ Rs. ${(bill.cgstAmount + bill.sgstAmount).toFixed(2)}`, pageWidth - 18, y + 21, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.line(pageWidth - 90, y + 26, pageWidth - 18, y + 26);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 105, 92);
  doc.text('NET PAYABLE:', pageWidth - 90, y + 33);
  doc.text(`Rs. ${bill.netPayable.toFixed(2)}`, pageWidth - 18, y + 33, { align: 'right' });

  // Compliance & Payment Footnote
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Payment Mode: ${bill.paymentMethod.toUpperCase()}`, 14, y + 10);
  doc.text('Statutory note: Prescriptions verified under Rule 65 Drugs and Cosmetics Act.', 14, y + 16);
  doc.text(`Address: ${settings.addressLine1}, ${settings.city}`, 14, y + 22);
  doc.text('*** THANK YOU • GET WELL SOON ***', 14, y + 30);

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);

  return { doc, blob, url };
}
