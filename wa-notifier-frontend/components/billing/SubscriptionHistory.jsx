'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, Spinner, PaginationControls, usePagination } from '@/components/ui';
import api from '@/lib/api';
import { History } from 'lucide-react';

const fmtDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN') : '-');
const fmtMoney = (value, currency = 'INR') => `${currency === 'INR' ? 'Rs. ' : `${currency} `}${Number(value || 0).toLocaleString('en-IN')}`;
const cycleLabel = (cycle) => String(cycle || '-').replace('_', ' ');

const STATUS_COLOR = { active: 'green', expired: 'gray', cancelled: 'red', pending: 'yellow' };

export default function SubscriptionHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api.get('/subscriptions/me/history')
      .then(({ data }) => { if (mounted) setHistory(Array.isArray(data) ? data : []); })
      .catch((err) => { if (mounted) setError(err?.response?.data?.message || 'Failed to load subscription history'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);
  const historyPage = usePagination(history, { initialPageSize: 10 });

  return (
    <Card className="mt-6 overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <History size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">Subscription history</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : error ? (
        <p className="px-4 py-6 text-sm text-destructive">{error}</p>
      ) : history.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No subscription history yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Plan</th>
                <th className="px-4 py-2.5">Billing cycle</th>
                <th className="px-4 py-2.5">Price</th>
                <th className="px-4 py-2.5">Start</th>
                <th className="px-4 py-2.5">End</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {historyPage.pageItems.map((sub) => (
                <tr key={sub._id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">{sub.planId?.name || 'Plan removed'}</td>
                  <td className="px-4 py-2.5 capitalize">{cycleLabel(sub.billingCycleSnapshot)}</td>
                  <td className="px-4 py-2.5">{fmtMoney(sub.priceSnapshot, sub.currency)}</td>
                  <td className="px-4 py-2.5">{fmtDate(sub.startDate)}</td>
                  <td className="px-4 py-2.5">{fmtDate(sub.endDate)}</td>
                  <td className="px-4 py-2.5">
                    <Badge color={STATUS_COLOR[sub.status] || 'gray'} label={sub.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && history.length > 0 && (
        <PaginationControls {...historyPage} onPageChange={historyPage.setPage} onPageSizeChange={historyPage.setPageSize} />
      )}
    </Card>
  );
}
