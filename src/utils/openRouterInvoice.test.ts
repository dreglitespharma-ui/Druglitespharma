import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOpenRouterInvoiceRequest,
  DEFAULT_OPENROUTER_INVOICE_MODEL,
  extractOpenRouterInvoiceText,
} from './openRouterInvoice';

test('builds OpenRouter image and PDF content blocks', () => {
  const request = buildOpenRouterInvoiceRequest([
    { imageBase64: 'data:image/png;base64,cG5n', mimeType: 'image/png' },
    { imageBase64: 'cGRm', mimeType: 'application/pdf' },
  ], 'Extract this invoice');

  assert.equal(request.model, DEFAULT_OPENROUTER_INVOICE_MODEL);
  assert.deepEqual(request.messages[0], { role: 'system', content: 'Extract this invoice' });
  assert.deepEqual(request.messages[1].content, [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,cG5n' } },
    {
      type: 'file',
      file: {
        filename: 'invoice.pdf',
        file_data: 'data:application/pdf;base64,cGRm',
      },
    },
  ]);
});

test('supports explicit OpenRouter model selection and extracts response text', () => {
  const request = buildOpenRouterInvoiceRequest(
    [{ imageBase64: 'image', mimeType: 'image/jpeg' }],
    'prompt',
    'provider/model'
  );
  assert.equal(request.model, 'provider/model');
  assert.equal(extractOpenRouterInvoiceText({
    choices: [{ message: { content: '{"items":[]}' } }],
  }), '{"items":[]}');
  assert.equal(extractOpenRouterInvoiceText({
    choices: [{ message: { content: [{ type: 'text', text: '{"items":[]}' }] } }],
  }), '{"items":[]}');
  assert.equal(extractOpenRouterInvoiceText({ choices: [] }), '');
});
