'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, Spinner } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';
import {
  isFacebookOrigin,
  isSuccessfulEmbeddedSignupEvent,
  normalizeEmbeddedSignupData,
  parseEmbeddedSignupMessage,
} from '@/lib/meta-embedded-signup';
import { ArrowRight, CheckCircle2, MessageCircle } from 'lucide-react';

const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID;
const metaConfigId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
const metaApiVersion = process.env.NEXT_PUBLIC_META_API_VERSION || 'v25.0';

export default function ConnectWhatsAppPage() {
  const router = useRouter();
  const { clients, loading: clientsLoading, refreshClients } = useClient();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [debugEvents, setDebugEvents] = useState([]);
  const [metaPayloads, setMetaPayloads] = useState([]);
  const signupRef = useRef({ code: '', setup: null, submitting: false, redirectUri: '' });
  const waitTimerRef = useRef(null);

  const addDebugEvent = (message) => {
    setDebugEvents(prev => [...prev.slice(-4), `${new Date().toLocaleTimeString()} - ${message}`]);
  };

  const clearWaitTimer = () => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
  };

  const redactPayload = (value) => {
    if (Array.isArray(value)) return value.map(redactPayload);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (/token|code|secret|password/i.test(key)) return [key, '[redacted]'];
        return [key, redactPayload(entry)];
      }),
    );
  };

  const captureMetaPayload = (payload) => {
    setMetaPayloads(prev => [
      ...prev.slice(-2),
      {
        receivedAt: new Date().toISOString(),
        payload: redactPayload(payload),
      },
    ]);
  };

  const startWaitTimer = () => {
    clearWaitTimer();
    waitTimerRef.current = setTimeout(() => {
      if (!signupRef.current.setup) {
        setConnecting(false);
        setStatus('');
        setError('Meta returned authorization, but did not send WhatsApp account details. Check that NEXT_PUBLIC_META_CONFIG_ID is a WhatsApp Embedded Signup configuration and that the Meta flow finished with a selected WABA and phone number.');
        addDebugEvent('Timed out waiting for WA_EMBEDDED_SIGNUP FINISH message');
      }
    }, 20000);
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
      setStatus('');
      setError('Meta granted access, but did not return a WhatsApp Business Account ID. Check that the selected business has a WhatsApp account and that the configuration grants WhatsApp account assets.');
      addDebugEvent('Missing WABA ID in Meta signup data');
      return;
    }

    clearWaitTimer();
    current.submitting = true;
    setConnecting(true);
    setError('');
    setStatus('Finalizing WhatsApp connection...');

    try {
      const { data: account } = await api.post('/whatsapp-accounts/embedded-signup', {
        code: current.code,
        wabaId,
        phoneNumberId,
        redirectUri: current.redirectUri,
        name: current.setup?.business_name || current.setup?.businessName || '',
      });
      await refreshClients(account?._id);
      resetSignupState();
      setConnected(true);
      setStatus('WhatsApp account connected successfully. Redirecting to dashboard...');
      window.setTimeout(() => router.replace('/master/dashboard'), 900);
    } catch (err) {
      signupRef.current.submitting = false;
      setError(err?.response?.data?.message || 'Could not complete the WhatsApp connection. Please try again.');
      setStatus('');
    } finally {
      setConnecting(false);
    }
  }, [refreshClients, router]);

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
      console.log('Received Meta Embedded Signup message', payload);
      captureMetaPayload(payload);

      const setupData = normalizeEmbeddedSignupData(payload.data);
      const setupKeys = Object.entries(setupData)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key]) => key)
        .join(', ');
      addDebugEvent(`Meta signup event: ${payload.event || 'unknown'}${setupKeys ? ` (${setupKeys})` : ''}`);

      if (isSuccessfulEmbeddedSignupEvent(payload.event)) {
        signupRef.current.setup = setupData;
        setStatus('WhatsApp details received. Waiting for authorization...');
        finishEmbeddedSignup();
        return;
      }

      if (payload.event === 'CANCEL') {
        resetSignupState();
        setConnecting(false);
        setStatus('');
        setError('WhatsApp connection was cancelled before completion.');
        return;
      }

      if (payload.event === 'ERROR') {
        resetSignupState();
        setConnecting(false);
        setStatus('');
        setError(payload.data?.error_message || 'Meta returned an error during WhatsApp connection.');
        return;
      }

      console.debug('Unhandled Meta Embedded Signup message', payload);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [finishEmbeddedSignup]);

  const connectWhatsApp = () => {
    setError('');
    setStatus('');

    if (!metaAppId || !metaConfigId) {
      setError('Meta Embedded Signup is not configured yet.');
      return;
    }
    if (!window.FB) {
      setError('Facebook SDK is still loading. Try again in a moment.');
      return;
    }

    resetSignupState();
    setConnecting(true);
    setStatus('Opening Facebook Embedded Signup...');
    addDebugEvent('Opening Meta Embedded Signup');

    const redirectUri = `${window.location.origin}/client/meta-embedded-signup`;
    signupRef.current.redirectUri = redirectUri;

    window.FB.login((response) => {
      if (response?.authResponse?.code) {
        signupRef.current.code = response.authResponse.code;
        setStatus('Authorization received. Waiting for WhatsApp details...');
        addDebugEvent('Meta authorization code received');
        startWaitTimer();
        console.debug('Meta Embedded Signup setup data', signupRef.current.setup);
        finishEmbeddedSignup();
        return;
      }

      resetSignupState();
      setConnecting(false);
      setStatus('');
      setError('Facebook authorization was cancelled or did not complete.');
      addDebugEvent('Meta authorization did not complete');
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

  if (clientsLoading) {
    return (
      <AppShell allowedRoles={['admin', 'master']}>
        <div className="flex justify-center py-20">
          <Spinner size={32} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <Card className="mx-auto max-w-md p-6">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-brand/10 text-brand">
          {connected ? <CheckCircle2 size={24} /> : <MessageCircle size={24} />}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Connect WhatsApp</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Link a Meta Business account and WhatsApp number to your workspace.
        </p>

        <div className="mt-5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {clients.length} WhatsApp number{clients.length === 1 ? '' : 's'} connected across the workspace.
        </div>

        {status && (
          <div className="mt-5 rounded-lg border border-green-500/25 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-300">
            {status}
          </div>
        )}
        {error && (
          <div className="mt-5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <Button className="mt-6 w-full" onClick={connectWhatsApp} disabled={connecting || connected}>
          <MessageCircle size={16} />
          {connected ? 'Connected' : connecting ? 'Connecting...' : 'Connect WhatsApp'}
        </Button>

        {connected && (
          <Link href="/master/dashboard">
            <Button variant="outline" className="mt-3 w-full">
              Open dashboard <ArrowRight size={15} />
            </Button>
          </Link>
        )}

        {debugEvents.length > 0 && (
          <div className="mt-5 rounded-lg border border-border bg-muted/60 px-3 py-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Connection debug</p>
            {debugEvents.map((event, index) => (
              <p key={`${event}-${index}`} className="font-mono text-[11px] text-muted-foreground">{event}</p>
            ))}
          </div>
        )}

        {metaPayloads.length > 0 && (
          <div className="mt-5 rounded-lg border border-border bg-muted/60 px-3 py-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Meta payload received</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-3 font-mono text-[11px] text-foreground">
              {JSON.stringify(metaPayloads, null, 2)}
            </pre>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
