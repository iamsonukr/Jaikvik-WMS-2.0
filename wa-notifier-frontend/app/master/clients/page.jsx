'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, Modal, Input, PageHeader, Empty } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';
import {
  isFacebookOrigin,
  isSuccessfulEmbeddedSignupEvent,
  normalizeEmbeddedSignupData,
  parseEmbeddedSignupMessage,
} from '@/lib/meta-embedded-signup';
import Link from 'next/link';
import { Plus, Building2, Pencil, Trash2, ExternalLink, MessageCircle } from 'lucide-react';

const blank = { name: '', wabaId: '', phoneNumberId: '', accessToken: '', phone: '', timezone: 'Asia/Kolkata', industry: '' };
const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID;
const metaConfigId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
const metaApiVersion = process.env.NEXT_PUBLIC_META_API_VERSION || 'v25.0';

export default function ClientsPage() {
  const { clients, setClients, activeClient, selectClient } = useClient();
  const [modal, setModal]   = useState(false);
  const [form,  setForm]    = useState(blank);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectStatus, setConnectStatus] = useState('');
  const signupRef = useRef({ code: '', setup: null, submitting: false, redirectUri: '' });
  const waitTimerRef = useRef(null);

  const clearWaitTimer = () => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
  };

  const startWaitTimer = () => {
    clearWaitTimer();
    waitTimerRef.current = setTimeout(() => {
      if (!signupRef.current.setup) {
        setConnecting(false);
        setConnectStatus('');
        setListError('Meta returned authorization, but did not send WhatsApp account details. Check that NEXT_PUBLIC_META_CONFIG_ID is a WhatsApp Embedded Signup configuration and complete the Meta flow with a selected WABA and phone number.');
      }
    }, 20000);
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const openNew  = ()    => { setForm(blank); setFormError(''); setEditing(null); setModal(true); };
  const openEdit = (c)   => {
    setForm({ name: c.name, wabaId: c.wabaId, phoneNumberId: c.phoneNumberId, accessToken: '', phone: c.phone || '', timezone: c.timezone || '', industry: c.industry || '' });
    setFormError('');
    setEditing(c._id);
    setModal(true);
  };
  const close = () => setModal(false);

  const save = async () => {
    if (!form.name.trim()) { setFormError('Business name is required.'); return; }
    if (!form.wabaId.trim()) { setFormError('WABA ID is required.'); return; }
    if (!form.phoneNumberId.trim()) { setFormError('Phone Number ID is required.'); return; }
    if (!editing && !form.accessToken.trim()) { setFormError('Access token is required.'); return; }
    setFormError('');
    setSaving(true);
    try {
      if (editing) {
        const { data } = await api.patch(`/clients/${editing}`, form);
        setClients(prev => prev.map(c => c._id === editing ? data : c));
      } else {
        const { data } = await api.post('/clients', form);
        setClients(prev => [...prev, data]);
      }
      close();
    } catch (err) {
      const msg = err?.response?.data?.message;
      setFormError(
        err?.response?.status === 409 || /duplicate/i.test(msg || '')
          ? 'A client with this Phone Number ID already exists.'
          : (msg || 'Could not save this client. Please try again.')
      );
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    setListError('');
    try {
      await api.delete(`/clients/${id}`);
      setClients(prev => prev.filter(c => c._id !== id));
      // If the deleted client was active, clear the stale selection so other pages don't
      // keep querying a clientId that no longer exists
      if (activeClient?._id === id) {
        localStorage.removeItem('wa_active_client');
        window.location.reload();
      }
    } catch {
      setListError('Could not delete this client. It may have related campaigns or contacts.');
    }
  };

  const resetSignupState = () => {
    clearWaitTimer();
    signupRef.current = { code: '', setup: null, submitting: false, redirectUri: '' };
  };

  const finishEmbeddedSignup = useCallback(async () => {
    const current = signupRef.current;
    const phoneNumberId = current.setup?.phone_number_id || current.setup?.phoneNumberId;
    const wabaId = current.setup?.waba_id || current.setup?.wabaId;

    if (!current.code || !current.setup || current.submitting) return;

    if (!wabaId) {
      clearWaitTimer();
      setConnecting(false);
      setConnectStatus('');
      setListError('Meta granted access, but did not return a WhatsApp Business Account ID. Check that the selected business has a WhatsApp account and that the configuration grants WhatsApp account assets.');
      return;
    }

    clearWaitTimer();
    current.submitting = true;
    setConnecting(true);
    setListError('');
    setConnectStatus('Finalizing WhatsApp connection...');

    try {
      const { data } = await api.post('/clients/embedded-signup', {
        code: current.code,
        wabaId,
        phoneNumberId,
        redirectUri: current.redirectUri,
        name: current.setup?.business_name || current.setup?.businessName || '',
      });
      setClients(prev => {
        const exists = prev.some(c => c._id === data._id);
        return exists ? prev.map(c => c._id === data._id ? data : c) : [...prev, data];
      });
      selectClient(data);
      setConnectStatus('WhatsApp account connected.');
      resetSignupState();
    } catch (err) {
      signupRef.current.submitting = false;
      setListError(err?.response?.data?.message || 'Could not complete Embedded Signup. Please try again.');
      setConnectStatus('');
    } finally {
      setConnecting(false);
    }
  }, [selectClient, setClients]);

  useEffect(() => {
    if (!metaAppId) return;

    window.fbAsyncInit = function () {
      window.FB.init({
        appId: metaAppId,
        cookie: true,
        xfbml: false,
        version: metaApiVersion,
      });
    };

    if (!document.getElementById('facebook-jssdk')) {
      const js = document.createElement('script');
      js.id = 'facebook-jssdk';
      js.src = 'https://connect.facebook.net/en_US/sdk.js';
      js.async = true;
      js.defer = true;
      document.body.appendChild(js);
    } else if (window.FB) {
      window.fbAsyncInit();
    }
  }, []);

  useEffect(() => {
    const onMessage = (event) => {
      if (!isFacebookOrigin(event.origin)) return;

      const payload = parseEmbeddedSignupMessage(event.data);
      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;

      if (isSuccessfulEmbeddedSignupEvent(payload.event)) {
        signupRef.current.setup = normalizeEmbeddedSignupData(payload.data);
        setConnectStatus('WhatsApp details received. Waiting for authorization code...');
        finishEmbeddedSignup();
        return;
      }

      if (payload.event === 'CANCEL') {
        resetSignupState();
        setConnecting(false);
        setConnectStatus('');
        setListError('Embedded Signup was cancelled before completion.');
        return;
      }

      if (payload.event === 'ERROR') {
        resetSignupState();
        setConnecting(false);
        setConnectStatus('');
        setListError(payload.data?.error_message || 'Embedded Signup returned an error.');
        return;
      }

      console.debug('Unhandled Meta Embedded Signup message', payload);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [finishEmbeddedSignup]);

  const connectWhatsApp = () => {
    setListError('');
    setConnectStatus('');

    if (!metaAppId || !metaConfigId) {
      setListError('Set NEXT_PUBLIC_META_APP_ID and NEXT_PUBLIC_META_CONFIG_ID in the frontend environment first.');
      return;
    }

    if (!window.FB) {
      setListError('Facebook SDK is still loading. Try again in a moment.');
      return;
    }

    resetSignupState();
    setConnecting(true);
    setConnectStatus('Opening Facebook Embedded Signup...');

    const redirectUri = `${window.location.origin}/meta-embedded-signup`;
    signupRef.current.redirectUri = redirectUri;

    window.FB.login((response) => {
      if (response?.authResponse?.code) {
        signupRef.current.code = response.authResponse.code;
        setConnectStatus('Authorization received. Waiting for WhatsApp details...');
        startWaitTimer();
        finishEmbeddedSignup();
        return;
      }

      resetSignupState();
      setConnecting(false);
      setConnectStatus('');
      setListError('Facebook authorization was cancelled or did not complete.');
    }, {
      config_id: metaConfigId,
      response_type: 'code',
      override_default_response_type: true,
      redirect_uri: redirectUri,
      fallback_redirect_uri: redirectUri,
      extras: {
        setup: {},
        featureType: 'whatsapp_embedded_signup',
        sessionInfoVersion: '3',
      },
    });
  };

  const renderClientActions = () => (
    <>
      <Button variant="outline" onClick={connectWhatsApp} disabled={connecting}>
        <MessageCircle size={16} />
        {connecting ? 'Connecting...' : 'Connect WhatsApp'}
      </Button>
      <Button onClick={openNew}><Plus size={16} />New Client</Button>
    </>
  );

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Clients"
        subtitle="Manage WhatsApp Business accounts"
        action={renderClientActions()}
      />

      {connectStatus && (
        <div className="soft-alert border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300 mb-5">{connectStatus}</div>
      )}

      {listError && (
        <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 mb-5">{listError}</div>
      )}

      {clients.length === 0
        ? <Empty icon={Building2} title="No clients yet" description="Add your first WhatsApp Business client to start sending messages." action={<div className="flex flex-wrap justify-center gap-2">{renderClientActions()}</div>} />
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {clients.map(c => (
              <Card key={c._id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                    <Building2 size={20} className="text-brand" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-accent-foreground"><Pencil size={14} /></button>
                    <button onClick={() => remove(c._id)} className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-muted-foreground hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-[var(--muted-text)] mt-0.5">{c.phone || c.phoneNumberId}</p>
                {c.industry && <p className="text-xs text-[var(--muted-text)]">{c.industry}</p>}
                <div className="mt-3 flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <div className="flex items-center gap-3">
                    <Link href={`/clients/${c._id}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"><ExternalLink size={11}/>Details</Link>
                    <button onClick={() => selectClient(c)} className="text-xs text-brand font-medium hover:underline">Select</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      }

      <Modal open={modal} onClose={close} title={editing ? 'Edit Client' : 'New Client'}
        footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}>
        <div className="space-y-3">
          {formError && <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{formError}</div>}
          <Input label="Business Name *" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Acme Corp" />
          <Input label="WABA ID *" value={form.wabaId} onChange={e => set('wabaId', e.target.value)} placeholder="102938475610293" />
          <Input label="Phone Number ID *" value={form.phoneNumberId} onChange={e => set('phoneNumberId', e.target.value)} placeholder="109283746501928" />
          <Input label={editing ? 'Access Token (leave blank to keep)' : 'Permanent Access Token *'} value={form.accessToken} onChange={e => set('accessToken', e.target.value)} type="password" placeholder="EAABsb…" />
          <Input label="Display Phone" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+919876543210" />
          <Input label="Industry" value={form.industry} onChange={e => set('industry', e.target.value)} placeholder="E-commerce" />
          <Input label="Timezone" value={form.timezone} onChange={e => set('timezone', e.target.value)} placeholder="Asia/Kolkata" />
        </div>
      </Modal>
    </AppShell>
  );
}
