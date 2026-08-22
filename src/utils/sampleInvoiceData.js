// Sample data for rendering a template preview PDF - lets a business see what
// a real invoice on a given template looks like (with their own logo/name)
// before committing to it, without needing a real invoice to already exist.
function buildSampleInvoiceData(entity, template) {
  return {
    template: template || entity?.invoiceTemplate || 'classic-ledger',
    businessName: entity?.name || 'Your Business',
    businessAddress: entity?.address || '14 Admiralty Way, Lekki Phase 1, Lagos',
    businessPhone: entity?.phone || '0800 000 0000',
    logoPath: entity?.logo || '',
    invoiceNumber: 'inv_previewsample01',
    issueDate: new Date(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: 'sent',
    currency: 'NGN',
    customer: { name: 'Ada Okoro', email: 'ada@example.com', address: 'Victoria Island, Lagos' },
    items: [
      { name: 'Brand strategy session', description: 'Brand strategy session', quantity: 1, unitPrice: 75000 },
      { name: 'Logo design', description: 'Logo design', quantity: 1, unitPrice: 120000 },
      { name: 'Business card printing', description: 'Business card printing', quantity: 250, unitPrice: 150 },
    ],
    vatRate: 7.5,
    paymentLink: 'https://example.com/payment/inv_previewsample01',
    bank: { accountName: entity?.name || 'Your Business', accountNumber: '0123456789', bankName: 'GTBank' },
  };
}

module.exports = { buildSampleInvoiceData };
