/**
 * Date utilities for Pharmacy Batch & Expiry tracking
 * Supports both standard formats: YYYY-MM / YYYY-MM-DD and pharmaceutical MM/YY / MM/YYYY
 */

export const parseExpiryDate = (dateStr?: string): Date | null => {
  if (!dateStr) return null;
  const str = dateStr.trim();
  if (!str) return null;

  // Handle standard ISO or YYYY-MM / YYYY-MM-DD
  if (str.includes('-')) {
    const parts = str.split('-').map(Number);
    if (parts[0] > 1000) {
      const year = parts[0];
      const month = parts[1] || 12;
      // Last day of month
      const day = parts[2] || new Date(year, month, 0).getDate();
      const d = new Date(year, month - 1, day, 23, 59, 59);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // Handle standard pharma MM/YY or MM/YYYY
  if (str.includes('/')) {
    const parts = str.split('/').map(Number);
    const month = parts[0];
    let year = parts[1];
    if (year < 100) year += 2000;
    if (year > 1900 && month >= 1 && month <= 12) {
      const day = new Date(year, month, 0).getDate();
      const d = new Date(year, month - 1, day, 23, 59, 59);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // Fallback direct Date parse
  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
};

export const getDaysUntilExpiry = (dateStr?: string, fromDate: Date = new Date()): number => {
  const exp = parseExpiryDate(dateStr);
  if (!exp) return 999;
  const diffMs = exp.getTime() - fromDate.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};
