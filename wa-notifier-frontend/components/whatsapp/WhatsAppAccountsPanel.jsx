'use client';

import { useState } from 'react';
import { Badge, Button, Card, Input, Modal, Select, Spinner } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';
import {
  Activity, Loader2, MessageCircle, Pencil, Phone, Power, RefreshCw,
  ShieldCheck, Trash2, Wifi,
} from 'lucide-react';

const blankEdit = { name: '', phone: '', timezone: '', industry: '', accessToken: '' };

function qualityColor(rating) {
  if (rating === 'GREEN') return 'green';
  if (rating === 'YELLOW') return 'yellow';
  if (rating === 'RED') return 'red';
  return 'gray';
}

export default function WhatsAppAccountsPanel() {
  const { clients, loading, refreshClients, activeClient } = useClient();

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(blankEdit);
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [pinTarget, setPinTarget] = useState(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

  const [diagTarget, setDiagTarget] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const [diagError, setDiagError] = useState('');

  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3500); };

  const openEdit = (account) => {
    setEditForm({
      name: account.name || '',
      phone: account.phone || '',
      timezone: account.timezone || '',
      industry: account.industry || '',
      accessToken: '',
    });
    setEditError('');
    setEditTarget(account);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    setSavingEdit(true);
    setEditError('');
    try {
      const payload = { ...editForm };
      if (!payload.accessToken) delete payload.accessToken;
      await api.patch(`/whatsapp-accounts/${editTarget._id}`, payload);
      setEditTarget(null);
      await refreshClients(editTarget._id);
      flash('WhatsApp account updated');
    } catch (err) {
      setEditError(err?.response?.data?.message || 'Failed to update account');
    } finally {
      setSavingEdit(false);
    }
  };

  const subscribeWebhook = async (account) => {
    setBusyId(account._id);
    setActionError('');
    try {
      await api.post(`/whatsapp-accounts/${account._id}/webhooks/subscribe`);
      flash('Webhook subscribed for ' + account.name);
    } catch (err) {
      setActionError(err?.response?.data?.message || 'Failed to subscribe webhook');
    } finally {
      setBusyId(null);
    }
  };

  const openPinModal = (account) => {
    setPinTarget(account);
    setPin('');
    setPinError('');
  };

  const submitPin = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) {
      setPinError('PIN must be exactly 6 digits.');
      return;
    }
    setPinSaving(true);
    setPinError('');
    try {
      await api.post(`/whatsapp-accounts/${pinTarget._id}/register`, { pin });
      setPinTarget(null);
      flash('Phone number registered');
    } catch (err) {
      setPinError(err?.response?.data?.message || 'Failed to register phone number');
    } finally {
      setPinSaving(false);
    }
  };

  const openDiagnostics = async (account) => {
    setDiagTarget(account);
    setDiagResult(null);
    setDiagError('');
    setDiagLoading(true);
    try {
      const { data } = await api.get(`/whatsapp-accounts/${account._id}/sending-diagnostics`);
      setDiagResult(data);
    } catch (err) {
      setDiagError(err?.response?.data?.message || 'Failed to run diagnostics');
    } finally {
      setDiagLoading(false);
    }
  };

  const toggleActive = async (account) => {
    setBusyId(account._id);
    setActionError('');
    try {
      await api.patch(`/whatsapp-accounts/${account._id}`, { isActive: !account.isActive });
      await refreshClients(account._id);
      flash(account.isActive ? 'Account deactivated' : 'Account activated');
    } catch (err) {
      setActionError(err?.response?.data?.message || 'Failed to update account status');
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = async () => {
    setRemoving(true);
    try {
      await api.delete(`/whatsapp-accounts/${removeTarget._id}`);
      setRemoveTarget(null);
      await refreshClients();
      flash('WhatsApp account removed');
    } catch (err) {
      setActionError(err?.response?.data?.message || 'Failed to remove account');
      setRemoveTarget(null);
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Spinner /></div>;
  }

  if (!clients.length) return null;

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Connected WhatsApp numbers ({clients.length})</h2>
      </div>

      {notice && (
        <div className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}
      {actionError && (
        <div className="mb-3 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {clients.map((account) => {
          const busy = busyId === account._id;
          return (
            <Card key={account._id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-white">
                    <MessageCircle size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{account.name}{activeClient?._id === account._id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(active)</span>}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Phone size={11} />{account.phone || 'No display number'}</p>
                  </div>
                </div>
                <Badge color={account.isActive ? 'green' : 'red'} label={account.isActive ? 'Active' : 'Deactivated'} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <p className="truncate">WABA ID: <span className="text-foreground">{account.wabaId}</span></p>
                <p className="truncate">Phone ID: <span className="text-foreground">{account.phoneNumberId}</span></p>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" onClick={() => openEdit(account)}><Pencil size={13} /> Edit</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => subscribeWebhook(account)}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />} Subscribe webhook
                </Button>
                <Button variant="outline" size="sm" onClick={() => openPinModal(account)}><ShieldCheck size={13} /> Register number</Button>
                <Button variant="outline" size="sm" onClick={() => openDiagnostics(account)}><Activity size={13} /> Diagnostics</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => toggleActive(account)}>
                  <Power size={13} /> {account.isActive ? 'Deactivate' : 'Activate'}
                </Button>
                <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setRemoveTarget(account)}>
                  <Trash2 size={13} /> Remove
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit — ${editTarget?.name || ''}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={submitEdit} disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save changes'}</Button>
          </>
        )}
      >
        <form onSubmit={submitEdit} className="flex flex-col gap-3">
          {editError && <p className="text-sm text-destructive">{editError}</p>}
          <Input label="Display name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
          <Input label="Display phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
          <Input label="Timezone" value={editForm.timezone} onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })} placeholder="Asia/Kolkata" />
          <Input label="Industry" value={editForm.industry} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} />
          <Input label="Access token (leave blank to keep current)" type="password" value={editForm.accessToken} onChange={(e) => setEditForm({ ...editForm, accessToken: e.target.value })} />
        </form>
      </Modal>

      {/* Register PIN modal */}
      <Modal
        open={!!pinTarget}
        onClose={() => setPinTarget(null)}
        title={`Register phone number — ${pinTarget?.name || ''}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setPinTarget(null)}>Cancel</Button>
            <Button onClick={submitPin} disabled={pinSaving}>{pinSaving ? 'Registering…' : 'Register'}</Button>
          </>
        )}
      >
        <form onSubmit={submitPin} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Enter the 6-digit PIN for this WhatsApp phone number (used for two-step verification with Meta).</p>
          {pinError && <p className="text-sm text-destructive">{pinError}</p>}
          <Input label="6-digit PIN" value={pin} maxLength={6} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required />
        </form>
      </Modal>

      {/* Diagnostics modal */}
      <Modal
        open={!!diagTarget}
        onClose={() => setDiagTarget(null)}
        title={`Diagnostics — ${diagTarget?.name || ''}`}
        footer={<Button variant="outline" onClick={() => setDiagTarget(null)}>Close</Button>}
      >
        {diagLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : diagError ? (
          <p className="text-sm text-destructive">{diagError}</p>
        ) : diagResult ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Phone number health</p>
              {diagResult.phoneNumber ? (
                <div className="grid grid-cols-2 gap-2">
                  <p>Verified name: <span className="font-medium">{diagResult.phoneNumber.verified_name || '-'}</span></p>
                  <p>Display number: <span className="font-medium">{diagResult.phoneNumber.display_phone_number || '-'}</span></p>
                  <p className="flex items-center gap-1.5">Quality: <Badge color={qualityColor(diagResult.phoneNumber.quality_rating)} label={diagResult.phoneNumber.quality_rating || 'Unknown'} /></p>
                  <p>Verification: <span className="font-medium">{diagResult.phoneNumber.code_verification_status || '-'}</span></p>
                </div>
              ) : (
                <p className="text-destructive">{diagResult.error || 'Could not fetch phone number status from Meta.'}</p>
              )}
            </div>

            {!!diagResult.wabaPhoneNumbers?.length && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Other numbers on this WABA</p>
                <div className="flex flex-col gap-1.5">
                  {diagResult.wabaPhoneNumbers.map((n) => (
                    <div key={n.id} className="flex items-center justify-between">
                      <span>{n.display_phone_number || n.id}</span>
                      <Badge color={qualityColor(n.quality_rating)} label={n.quality_rating || 'Unknown'} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {diagResult.wabaPhoneNumbersError && (
              <p className="text-xs text-destructive">{diagResult.wabaPhoneNumbersError}</p>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Remove confirmation */}
      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Remove WhatsApp account"
        footer={(
          <>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmRemove} dis  abled={removing}>{removing ? 'Removing…' : 'Remove'}</Button>
          </>
        )}
      >
        <p className="text-sm text-muted-foreground">
          Remove <strong>{removeTarget?.name}</strong> ({removeTarget?.phone || removeTarget?.phoneNumberId})? Broadcasts, templates, and inbox history tied to this number will remain, but it will stop sending or receiving messages.
        </p>
      </Modal>
    </div>
  );
}
