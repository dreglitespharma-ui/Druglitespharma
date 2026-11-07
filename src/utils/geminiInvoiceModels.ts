export const INVOICE_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

function isQuotaFailure(message: string): boolean {
  return /(?:\b429\b|RESOURCE_EXHAUSTED|quota exceeded)/i.test(message);
}

function isTemporaryUnavailable(message: string): boolean {
  return /(?:\b503\b|UNAVAILABLE|high demand|temporarily unavailable|overloaded)/i.test(message);
}

function isModelUnavailable(message: string): boolean {
  return /(?:\b404\b|NOT_FOUND)/i.test(message);
}

function isPermissionFailure(message: string): boolean {
  return /(?:\b403\b|PERMISSION_DENIED)/i.test(message);
}

function isTimeout(message: string): boolean {
  return message.startsWith('MODEL_TIMEOUT:');
}

export function createInvoiceGeminiError(messages: string[]): Error {
  if (
    messages.some(isQuotaFailure) &&
    messages.every(message => isQuotaFailure(message) || isModelUnavailable(message))
  ) {
    return new Error('AI_QUOTA: Gemini quota is temporarily exhausted for all available invoice models.');
  }

  if (messages.length > 0 && messages.every(message => isPermissionFailure(message) || isModelUnavailable(message))) {
    return new Error('AI_PERMISSION: The configured Gemini API key does not have access to an invoice-reading model.');
  }

  if (
    messages.some(isTemporaryUnavailable) &&
    messages.every(message => isTemporaryUnavailable(message) || isModelUnavailable(message) || isTimeout(message))
  ) {
    return new Error('AI_BUSY: Gemini invoice-reading models are temporarily at capacity. Try again shortly.');
  }

  if (messages.some(isTimeout) && messages.every(message => isTimeout(message) || isModelUnavailable(message))) {
    return new Error('AI_TIMEOUT: Invoice reading took too long. Try a clearer, smaller image or upload fewer pages at once.');
  }

  const finalMessage = messages[messages.length - 1] || '';
  return new Error(`AI_UNAVAILABLE: Invoice-reading models could not process this request. ${finalMessage.slice(0, 180)}`);
}
