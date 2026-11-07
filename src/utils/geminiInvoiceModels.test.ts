import assert from 'node:assert/strict';
import test from 'node:test';
import { createInvoiceGeminiError, INVOICE_GEMINI_MODELS } from './geminiInvoiceModels';

test('invoice parsing tries the configured current Gemini models first', () => {
  assert.deepEqual(INVOICE_GEMINI_MODELS, [
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
  ]);
});

test('invoice parsing does not fall back to retired Gemini 2.5 models', () => {
  assert.equal(INVOICE_GEMINI_MODELS.some(model => model.startsWith('gemini-2.5-')), false);
});

test('a quota failure is retained when the final fallback is an unavailable model', () => {
  assert.match(
    createInvoiceGeminiError([
      '429 RESOURCE_EXHAUSTED',
      '404 NOT_FOUND',
    ]).message,
    /^AI_QUOTA:/
  );
});

test('temporary model overload is reported separately from invoice or connection errors', () => {
  assert.match(
    createInvoiceGeminiError([
      'MODEL_TIMEOUT: gemini-3.8-flash',
      '503 UNAVAILABLE: high demand',
      '404 NOT_FOUND',
    ]).message,
    /^AI_BUSY:/
  );
});

test('permission failures are reported distinctly from service failures', () => {
  assert.match(
    createInvoiceGeminiError(['403 PERMISSION_DENIED', '404 NOT_FOUND']).message,
    /^AI_PERMISSION:/
  );
});

test('timeout failures are reported distinctly from service failures', () => {
  assert.match(
    createInvoiceGeminiError(['MODEL_TIMEOUT: gemini-3.8-flash']).message,
    /^AI_TIMEOUT:/
  );
});

test('unclassified server failures preserve a useful diagnostic', () => {
  assert.match(
    createInvoiceGeminiError(['500 INTERNAL']).message,
    /^AI_UNAVAILABLE:.*500 INTERNAL$/
  );
});
