import { 
  Medicine, 
  PurchaseInward, 
  ParsedInvoice, 
  ParsedInvoiceItem, 
  AIAssistantAction,
  BatchInfo 
} from '../types/pharmacy';
import { StorageService } from './storage';
import { sound } from './sound';
import { auth } from '../firebase/config';

async function getAIRequestHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in with an authorized pharmacy staff account to use AI features.');
  const token = await user.getIdToken(true);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function isValidInvoiceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export interface ParseInvoiceResponse extends ParsedInvoice {
  success: boolean;
  mode?: string;
  pageCount?: number;
  error?: string;
}

export interface AssistantChatResponse {
  reply: string;
  thinking?: string;
  inventoryMatches?: any[];
  suggestedActions?: AIAssistantAction[];
  quickReplies?: string[];
  error?: string;
}

export class AIService {
  /**
   * Send an invoice image/document to the server-side Gemini Flash model
   */
  static async parseInvoice(
    images: string | Array<{ base64: string; mimeType: string }>,
    mimeType: string = 'image/jpeg',
    existingCatalog: Medicine[] = []
  ): Promise<ParseInvoiceResponse> {
    try {
      const submittedImages = (Array.isArray(images) ? images : [{ base64: images, mimeType }]).map(image => ({
        imageBase64: image.base64,
        mimeType: image.base64.match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,/i)?.[1] || image.mimeType,
      }));
      const response = await fetch('/api/gemini/parse-invoice', {
        method: 'POST',
        headers: await getAIRequestHeaders(),
        body: JSON.stringify({
          imageBase64: submittedImages[0].imageBase64,
          mimeType: submittedImages[0].mimeType,
          images: submittedImages,
          existingCatalog: existingCatalog.map(m => ({
            id: m.id,
            brandName: m.brandName,
            genericName: m.genericName,
            strength: m.strength,
            dosageForm: m.dosageForm,
            category: m.category,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }

      const data: ParseInvoiceResponse = await response.json();
      if (submittedImages.length > 1 && data.pageCount !== submittedImages.length) {
        throw new Error('The invoice server needs to be restarted to read multiple pages. Restart the app, then upload the pages again.');
      }
      return data;
    } catch (error) {
      console.error('[AIService] Invoice extraction failed:', error);
      throw error instanceof Error ? error : new Error('Invoice extraction failed.');
    }
  }

  /**
   * Conversational Pharmacy Assistant (Dr. Maya)
   */
  static async chatWithAssistant(params: {
    message: string;
    history?: { role: 'user' | 'assistant'; text: string }[];
    context?: any;
    attachedImage?: { base64: string; mimeType: string };
  }): Promise<AssistantChatResponse> {
    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: await getAIRequestHeaders(),
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[AIService] Assistant request failed:', error);
      throw error instanceof Error ? error : new Error('The AI assistant could not complete this request.');
    }
  }

  /**
   * Automatically apply parsed invoice items into pharmacy inventory and inward records
   */
  static applyInvoiceToInventory(
    parsedInvoice: ParsedInvoice,
    supplierId?: string,
    paymentStatus?: PurchaseInward['paymentStatus']
  ): {
    success: boolean;
    inwardNumber: string;
    supplierName?: string;
    supplierInvoiceNo?: string;
    itemsCount: number;
    newMedicinesCount: number;
    updatedMedicinesCount: number;
    totalAmount: number;
    message?: string;
  } {
    try {
      if (!paymentStatus) throw new Error('Choose a payment status before adding this invoice.');
      if (
        !parsedInvoice.supplier?.firmName?.trim() ||
        !parsedInvoice.supplier.invoiceNo?.trim() ||
        !isValidInvoiceDate(parsedInvoice.supplier.invoiceDate)
      ) {
        throw new Error('Verify the supplier name, invoice number, and invoice date before adding this invoice.');
      }
      if (!Array.isArray(parsedInvoice.items) || parsedInvoice.items.length === 0) {
        throw new Error('The invoice has no line items to add.');
      }

      const suppliers = StorageService.getSuppliers();
      const supName = parsedInvoice.supplier.firmName.trim();
      const selectedSupplier = supplierId ? suppliers.find(supplier => supplier.id === supplierId) : undefined;
      if (supplierId && !selectedSupplier) throw new Error('The selected supplier could not be found.');
      let supplier = selectedSupplier || suppliers.find(s => 
        s?.firmName && supName && (
          s.firmName.toLowerCase().includes(supName.toLowerCase()) ||
          supName.toLowerCase().includes(s.firmName.toLowerCase())
        )
      );

      const isNewSupplier = !supplier;
      if (!supplier) {
        // Auto-register new supplier if missing
        supplier = {
          id: `sup-${Date.now()}`,
          firmName: supName,
          contactPerson: '',
          phone: '',
          gstin: parsedInvoice.supplier.gstin || '',
          drugLicenseNo: '',
          creditDays: 0,
          address: '',
          city: '',
          state: '',
          totalPurchases: 0,
          outstandingBalance: 0,
        };
      }

      const inwardItems = (parsedInvoice.items || []).map(item => {
        const packSize = Number(item.packSize);
        const freeQty = Number(item.freeQty ?? 0);
        const quantity = Number(item.quantity);
        const purchaseCost = Number(item.purchaseCost);
        const extractedTradePrice = item.tradePrice == null ? Number.NaN : Number(item.tradePrice);
        const tradePrice = Number.isFinite(extractedTradePrice) && extractedTradePrice >= 0
          ? extractedTradePrice
          : null;
        const sellingMrp = Number(item.sellingMrp);
        const extractedTaxableAmount = Number(item.taxableAmount);
        const taxableAmount = Number.isFinite(extractedTaxableAmount) && extractedTaxableAmount >= 0
          ? Math.round(extractedTaxableAmount * 100) / 100
          : Math.round(quantity * purchaseCost * 100) / 100;
        const extractedGstAmount = Number(item.gstAmount);
        const gstAmount = Number.isFinite(extractedGstAmount) && extractedGstAmount >= 0
          ? Math.round(extractedGstAmount * 100) / 100
          : Math.round(taxableAmount * Number(item.gstRate)) / 100;
        const invalidFields: string[] = [];
        if (!item.medicineName?.trim()) invalidFields.push('medicine name');
        if (!item.batchNumber?.trim()) invalidFields.push('batch number');
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(item.expiryDate)) invalidFields.push('expiry (YYYY-MM)');
        if (!Number.isInteger(packSize) || packSize < 1) invalidFields.push('pack size');
        if (!Number.isInteger(freeQty) || freeQty < 0) invalidFields.push('free quantity');
        if (!Number.isInteger(quantity) || quantity < 1) invalidFields.push('billed quantity');
        if (!Number.isFinite(purchaseCost) || purchaseCost < 0) invalidFields.push('purchase cost');
        if (!Number.isFinite(sellingMrp) || sellingMrp < 0) invalidFields.push('MRP');
        if (!Number.isFinite(taxableAmount) || taxableAmount < 0) invalidFields.push('taxable amount');
        if (!Number.isFinite(gstAmount) || gstAmount < 0) invalidFields.push('GST amount');
        if (!Number.isFinite(Number(item.gstRate))) invalidFields.push('GST rate');
        if (
          invalidFields.length > 0
        ) {
          throw new Error(`Verify ${invalidFields.join(', ')} for ${item.medicineName || 'the invoice item'}.`);
        }
        const unitMrp = item.unitMrp || Math.round((sellingMrp / packSize) * 100) / 100;
        const unitPurchaseCost = item.unitPurchaseCost || Math.round((purchaseCost / packSize) * 100) / 100;
        const totalBaseUnits = (quantity + freeQty) * packSize;

        return {
          medicineName: item.medicineName.trim(),
          genericName: item.genericName || '',
          dosageForm: item.dosageForm,
          strength: item.strength || '',
          category: item.category,
          batchNumber: item.batchNumber.trim().toUpperCase(),
          mfgDate: item.mfgDate || '',
          expiryDate: item.expiryDate,
          quantity,
          freeQty,
          packSize,
          packUnit: item.packUnit || '',
          unitMrp,
          unitPurchaseCost,
          totalBaseUnits,
          purchaseCost,
          tradePrice,
          sellingMrp,
          taxableAmount,
          gstAmount,
          gstRate: item.gstRate,
          hsnCode: item.hsnCode || '',
          rackLocation: item.rackLocation || '',
          barcode: '',
        };
      });

      const inward: PurchaseInward = {
        id: `inward-${Date.now()}`,
        inwardNumber: `INW-${Math.floor(10000 + Math.random() * 90000)}`,
        supplierId: supplier.id,
        supplierName: supplier.firmName,
        supplierInvoiceNo: parsedInvoice.supplier.invoiceNo,
        invoiceDate: parsedInvoice.supplier.invoiceDate,
        receivedDate: new Date().toISOString().split('T')[0],
        billImageUrl: parsedInvoice.rawImage,
        items: inwardItems,
        taxableTotal: parsedInvoice.totalTaxable || 0,
        gstTotal: parsedInvoice.totalGst || 0,
        netBillAmount: parsedInvoice.netAmount || 0,
        paymentStatus,
      };
      if (isNewSupplier) StorageService.addSupplier(supplier);

      // Calculate how many were new vs updated
      const existingMeds = StorageService.getMedicines();
      let newMeds = 0;
      let updatedMeds = 0;

      inwardItems.forEach(item => {
        const itemLower = item.medicineName.toLowerCase();
        const match = existingMeds.find(m => m?.brandName && m.brandName.trim().toLowerCase() === itemLower);
        if (match) {
          updatedMeds++;
        } else {
          newMeds++;
        }
      });

      // Record the inward into storage (which updates stock batches & creates new medicines automatically)
      StorageService.addPurchaseInward(inward);
      sound.playSuccessChime();

      return {
        success: true,
        inwardNumber: inward.inwardNumber,
        supplierName: supplier.firmName,
        supplierInvoiceNo: inward.supplierInvoiceNo,
        itemsCount: inwardItems.length,
        newMedicinesCount: newMeds,
        updatedMedicinesCount: updatedMeds,
        totalAmount: inward.netBillAmount,
      };
    } catch (err: any) {
      console.error('AIService.applyInvoiceToInventory error:', err);
      throw new Error(err?.message || 'Error saving invoice items into inventory storage');
    }
  }

  /**
   * Execute an actionable operation proposed by the AI Assistant
   */
  static executeAssistantAction(action: AIAssistantAction): { success: boolean; message: string } {
    try {
      const medicines = StorageService.getMedicines();

      if (action.type === 'ADJUST_STOCK') {
        const med = medicines.find(m => 
          (action.medicineId && m.id === action.medicineId) || 
          (action.medicineName && m.brandName.toLowerCase() === action.medicineName.toLowerCase())
        );
        if (!med) return { success: false, message: `Medicine "${action.medicineName}" not found.` };

        let batch = action.batchNumber 
          ? med.batches.find(b => b.batchNumber === action.batchNumber) 
          : med.batches[0];

        if (!batch) {
          if (med.batches.length > 0) batch = med.batches[0];
          else return { success: false, message: `No batch available to adjust for ${med.brandName}` };
        }

        const oldStock = batch.stock;
        if (action.newStock !== undefined) {
          batch.stock = Math.max(0, action.newStock);
        } else if (action.deltaStock !== undefined) {
          batch.stock = Math.max(0, batch.stock + action.deltaStock);
        }

        StorageService.updateMedicine(med);
        StorageService.addAuditLog(
          'STOCK_ADJUSTMENT_AI',
          `AI adjusted stock for ${med.brandName} (Batch ${batch.batchNumber}) from ${oldStock} to ${batch.stock}. Reason: ${action.reason || 'AI recommendation'}`
        );
        sound.playSuccessChime();
        return { 
          success: true, 
          message: `Stock for ${med.brandName} (Batch ${batch.batchNumber}) adjusted from ${oldStock} to ${batch.stock} units.` 
        };
      }

      if (action.type === 'UPDATE_PRICE') {
        const med = medicines.find(m => 
          (action.medicineId && m.id === action.medicineId) || 
          (action.medicineName && m.brandName.toLowerCase() === action.medicineName.toLowerCase())
        );
        if (!med) return { success: false, message: `Medicine "${action.medicineName}" not found.` };

        const batch = action.batchNumber 
          ? med.batches.find(b => b.batchNumber === action.batchNumber) 
          : med.batches[0];

        if (!batch) return { success: false, message: `Batch not found.` };

        if (action.newMrp) batch.mrp = action.newMrp;
        if (action.newPurchasePrice) batch.purchasePrice = action.newPurchasePrice;

        StorageService.updateMedicine(med);
        StorageService.addAuditLog(
          'PRICE_UPDATE_AI',
          `AI updated price for ${med.brandName}: MRP ₹${batch.mrp}, Cost ₹${batch.purchasePrice}`
        );
        sound.playSuccessChime();
        return { success: true, message: `Updated pricing for ${med.brandName} (Batch ${batch.batchNumber}) to MRP ₹${batch.mrp}.` };
      }

      if (action.type === 'UPDATE_EXPIRY') {
        const med = medicines.find(m => 
          (action.medicineId && m.id === action.medicineId) || 
          (action.medicineName && m.brandName.toLowerCase() === action.medicineName.toLowerCase())
        );
        if (!med) return { success: false, message: `Medicine "${action.medicineName}" not found.` };

        const batch = action.batchNumber 
          ? med.batches.find(b => b.batchNumber === action.batchNumber) 
          : med.batches[0];

        if (!batch) return { success: false, message: `Batch not found.` };

        if (action.newExpiryDate) {
          batch.expiryDate = action.newExpiryDate;
          StorageService.updateMedicine(med);
          StorageService.addAuditLog(
            'EXPIRY_UPDATE_AI',
            `AI updated expiry date for ${med.brandName} (Batch ${batch.batchNumber}) to ${action.newExpiryDate}`
          );
          sound.playSuccessChime();
          return { success: true, message: `Updated expiry date for ${med.brandName} to ${action.newExpiryDate}.` };
        }
      }

      if (action.type === 'AUTO_FILL_INWARD' && action.invoiceData) {
        this.applyInvoiceToInventory(action.invoiceData);
        return { success: true, message: `Invoice auto-filled into inventory and inward goods successfully.` };
      }

      return { success: false, message: `Unknown or unhandled action type: ${action.type}` };
    } catch (err: any) {
      return { success: false, message: `Adjustment failed: ${err.message}` };
    }
  }


}
