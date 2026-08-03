'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, PageHeader, Select, Spinner, PaginationControls, usePagination } from '@/components/ui';
import api from '@/lib/api';
import { CreditCard, Download, FileText, Wallet } from 'lucide-react';

const fmtDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN') : '-');
const fmtDateTime = (value) => (value ? new Date(value).toLocaleString('en-IN') : '-');
const fmtMoney = (value, currency = 'INR') => `${currency === 'INR' ? 'Rs. ' : `${currency} `}${Number(value || 0).toLocaleString('en-IN')}`;

const STATUS_COLOR = { paid: 'green', created: 'yellow', failed: 'red' };
const PURPOSE_LABEL = { wallet_recharge: 'Wallet recharge', subscription: 'Subscription' };
const DOCUMENT_LABEL = { wallet_recharge: 'Recharge receipt', subscription: 'GST invoice' };

function normalizePayment(p) {
  return { ...p, _id: p?._id || p?.id };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function invoiceHtml(invoice) {
  const b = invoice.billTo || {};
  const addressLines = [b.addressLine1, b.addressLine2, [b.city, b.state, b.postalCode].filter(Boolean).join(', '), b.country]
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br/>');
  const status = escapeHtml(String(invoice.status || '').toUpperCase());
  const currency = escapeHtml(invoice.currency || 'INR');
  const lineItem = invoice.lineItem || {};

  return `
    <html>
      <head>
        <title>${escapeHtml(invoice.documentTitle || invoice.invoiceNumber)}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, Arial, sans-serif; color: #111; padding: 40px; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .muted { color: #666; font-size: 13px; }
          .row { display: flex; justify-content: space-between; margin-top: 28px; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e5e5; font-size: 14px; }
          th { color: #666; font-weight: 600; font-size: 12px; text-transform: uppercase; }
          .totals td { border: none; padding: 4px 8px; }
          .totals .label { color: #666; }
          .grand { font-weight: 700; font-size: 16px; border-top: 2px solid #111; }
          .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; background: #e8f9ee; color: #0a7d3c; }
        </style>
      </head>
      <body onload="window.print()">
        <h1>${escapeHtml(invoice.documentTitle || 'Invoice')} ${escapeHtml(invoice.invoiceNumber)}</h1>
        <p class="muted">Issued ${escapeHtml(new Date(invoice.issuedAt).toLocaleString('en-IN'))} &middot; <span class="badge">${status}</span></p>

        <div class="row">
          <div>
            <p class="muted">Billed to</p>
            <p><strong>${escapeHtml(b.name)}</strong></p>
            ${b.gstin ? `<p class="muted">GSTIN: ${escapeHtml(b.gstin)}</p>` : ''}
            <p class="muted">${addressLines || ''}</p>
            <p class="muted">${escapeHtml(b.email)}</p>
          </div>
          <div style="text-align:right">
            <p class="muted">Razorpay order</p>
            <p>${escapeHtml(invoice.razorpayOrderId)}</p>
            ${invoice.razorpayPaymentId ? `<p class="muted">Payment ID</p><p>${escapeHtml(invoice.razorpayPaymentId)}</p>` : ''}
          </div>
        </div>

        <table>
          <thead><tr><th>Description</th><th>Amount</th></tr></thead>
          <tbody>
            <tr><td>${escapeHtml(lineItem.description)}</td><td>${currency} ${Number(lineItem.baseAmount || 0).toLocaleString('en-IN')}</td></tr>
          </tbody>
        </table>

        <table class="totals" style="width: 280px; margin-left: auto;">
          <tr><td class="label">Subtotal</td><td style="text-align:right">${currency} ${Number(lineItem.baseAmount || 0).toLocaleString('en-IN')}</td></tr>
          <tr><td class="label">Tax (${Number(lineItem.taxPercent || 0).toLocaleString('en-IN')}%)</td><td style="text-align:right">${currency} ${Number(lineItem.taxAmount || 0).toLocaleString('en-IN')}</td></tr>
          <tr class="grand"><td>Total</td><td style="text-align:right">${currency} ${Number(lineItem.totalAmount || 0).toLocaleString('en-IN')}</td></tr>
        </table>
      </body>
    </html>
  `;
}

export default function PaymentHistoryWorkspace() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [invoicingId, setInvoicingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    let mounted = true;
    api.get('/payments/me')
      .then(({ data }) => { if (mounted) setPayments((Array.isArray(data) ? data : []).map(normalizePayment)); })
      .catch((err) => { if (mounted) setError(err?.response?.data?.message || 'Failed to load payment history'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => payments.filter((p) => (
    (purposeFilter === 'all' || p.purpose === purposeFilter) &&
    (statusFilter === 'all' || p.status === statusFilter)
  )), [payments, purposeFilter, statusFilter]);
  const paymentsPage = usePagination(filtered, {
    initialPageSize: 10,
    resetKey: `${purposeFilter}|${statusFilter}`,
  });

  const downloadInvoice = async (payment) => {
    setInvoicingId(payment._id);
    try {
      const { data } = await api.get(`/payments/me/${payment._id}/invoice`);
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(invoiceHtml(data));
      win.document.close();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to generate invoice');
    } finally {
      setInvoicingId(null);
    }
  };

  const downloadPdf = async (payment) => {
    setDownloadingId(payment._id);
    try {
      const { data, headers } = await api.get(`/payments/me/${payment._id}/invoice.pdf`, { responseType: 'blob' });
      const disposition = headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || `${DOCUMENT_LABEL[payment.purpose] || 'billing-document'}-${payment._id}.pdf`;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to download PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const exportCsv = () => {
    const header = ['Date', 'Purpose', 'Order ID', 'Payment ID', 'Amount', 'Currency', 'Status'];
    const rows = filtered.map((p) => [
      fmtDateTime(p.createdAt), PURPOSE_LABEL[p.purpose] || p.purpose, p.razorpayOrderId,
      p.razorpayPaymentId || '', p.amount, p.currency, p.status,
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Razorpay payment history for wallet recharges and subscription purchases."
        action={<Button variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download size={15} /> Export CSV</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value)} className="w-48">
          <option value="all">All types</option>
          <option value="wallet_recharge">Wallet recharge</option>
          <option value="subscription">Subscription</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="created">Pending</option>
          <option value="failed">Failed</option>
        </Select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</div>
      )}

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <CreditCard size={28} className="text-muted-foreground" />
            <p className="font-semibold">No payments found</p>
            <p className="max-w-xs text-sm text-muted-foreground">Wallet recharges and subscription purchases will show up here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paymentsPage.pageItems.map((p) => (
                  <tr key={p._id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">{fmtDateTime(p.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        {p.purpose === 'wallet_recharge' ? <Wallet size={13} /> : <CreditCard size={13} />}
                        {PURPOSE_LABEL[p.purpose] || p.purpose}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.razorpayOrderId}</td>
                    <td className="px-4 py-3 font-medium">{fmtMoney(p.amount, p.currency)}</td>
                    <td className="px-4 py-3"><Badge color={STATUS_COLOR[p.status] || 'gray'} label={p.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                      <Button
                        variant="outline" size="sm"
                        disabled={p.status !== 'paid' || invoicingId === p._id}
                        onClick={() => downloadInvoice(p)}
                      >
                        <FileText size={13} /> {invoicingId === p._id ? 'Preparing…' : 'View / Download'}
                      </Button>
                      <Button
                        size="sm"
                        disabled={p.status !== 'paid' || downloadingId === p._id}
                        onClick={() => downloadPdf(p)}
                      >
                        <Download size={13} /> {downloadingId === p._id ? 'Downloading...' : 'PDF'}
                      </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <PaginationControls {...paymentsPage} onPageChange={paymentsPage.setPage} onPageSizeChange={paymentsPage.setPageSize} />
        )}
      </Card>
    </div>
  );
}
