export const DEFAULT_OPENROUTER_INVOICE_MODEL = 'openai/gpt-4o-mini';

export interface InvoiceFileInput {
  imageBase64: string;
  mimeType: string;
}

export function buildOpenRouterInvoiceRequest(
  files: InvoiceFileInput[],
  prompt: string,
  model = DEFAULT_OPENROUTER_INVOICE_MODEL
) {
  const content = files.map(file => {
    const data = file.imageBase64.replace(/^data:[^;]+;base64,/, '');
    if (file.mimeType === 'application/pdf') {
      return {
        type: 'file',
        file: {
          filename: 'invoice.pdf',
          file_data: `data:application/pdf;base64,${data}`,
        },
      };
    }

    return {
      type: 'image_url',
      image_url: {
        url: `data:${file.mimeType};base64,${data}`,
      },
    };
  });

  return {
    model,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content },
    ],
  };
}

export function extractOpenRouterInvoiceText(response: unknown): string {
  if (response === null || typeof response !== 'object' || !('choices' in response)) return '';
  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const message = choices[0];
  if (message === null || typeof message !== 'object' || !('message' in message)) return '';
  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is { type: 'text'; text: string } =>
      block !== null &&
      typeof block === 'object' &&
      'type' in block &&
      block.type === 'text' &&
      'text' in block &&
      typeof block.text === 'string'
    )
    .map(block => block.text)
    .join('\n')
    .trim();
}
