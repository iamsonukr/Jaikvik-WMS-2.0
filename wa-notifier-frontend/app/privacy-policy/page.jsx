import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | Jaikvik WMS',
  description: 'Privacy policy for Jaikvik WMS WhatsApp Business Platform services.',
};

const sections = [
  {
    title: '1. Who We Are',
    body: [
      'Jaikvik WMS is a WhatsApp Business Platform management application operated by Jaikvik Technology. The application helps businesses connect WhatsApp Business Accounts, manage contacts, send approved template messages, receive inbound messages, automate keyword replies, and review campaign and inbox activity.',
      'This policy applies to our dashboard, backend APIs, WhatsApp Business Platform integration, Embedded Signup flow, webhooks, and related support services.',
    ],
  },
  {
    title: '2. Information We Collect',
    body: [
      'Account and user information: name, email address, login activity, role information, authentication data, and support communications.',
      'Business and WhatsApp account information: business name, WhatsApp Business Account ID, phone number ID, display phone number, template metadata, webhook status, connected account status, and access tokens required to operate the service.',
      'Customer and contact information: phone numbers, names, tags, opt-out status, custom variables used for message personalization, and imported contact lists provided by the business user.',
      'Messaging and campaign information: message templates, campaign configuration, recipient logs, delivery/read/failure statuses, inbound messages received through Meta webhooks, outbound replies sent from the dashboard, media references, chatbot keyword rules, and analytics derived from this activity.',
      'Technical information: IP address, browser/device information, request logs, error logs, timestamps, and security audit information needed to keep the service reliable and secure.',
    ],
  },
  {
    title: '3. How We Use Information',
    body: [
      'We use information to create and manage user accounts, connect WhatsApp Business Accounts through Meta Embedded Signup, send and receive WhatsApp messages, sync approved message templates, maintain contacts and opt-out preferences, power inbox and chatbot workflows, show delivery analytics, troubleshoot errors, prevent abuse, secure the service, provide customer support, and comply with legal and platform obligations.',
      'We do not sell personal information. We do not use WhatsApp message content for unrelated advertising or profiling.',
    ],
  },
  {
    title: '4. WhatsApp Business Platform and Meta Data',
    body: [
      'Jaikvik WMS uses Meta APIs and webhooks to provide WhatsApp Business Platform functionality. Depending on the permissions granted by the business, we may use Meta data to identify connected WhatsApp assets, retrieve template and phone-number information, send business messages, receive inbound customer messages, receive message status updates, and manage WhatsApp Business operations requested by the business user.',
      'Messages sent or received through WhatsApp are also governed by WhatsApp and Meta terms, policies, and technical controls. Businesses using Jaikvik WMS are responsible for having a lawful basis and customer consent where required for their messaging use case.',
    ],
  },
  {
    title: '5. How We Share Information',
    body: [
      'We share information only when needed to provide or protect the service: with Meta and WhatsApp Business Platform APIs for messaging and account management, cloud hosting and database providers, security and monitoring providers, support tools used to respond to requests, and authorities when legally required.',
      'Service providers are expected to process information only for the services they provide to us and to protect it using appropriate safeguards.',
    ],
  },
  {
    title: '6. Data Retention',
    body: [
      'We keep account, business, contact, message, campaign, webhook, and analytics data for as long as needed to provide the service, maintain records requested by the business user, meet security and legal obligations, resolve disputes, and enforce agreements.',
      'When an account is deleted or a verified deletion request is approved, we delete or anonymize personal information unless we must retain limited records for legal, security, fraud-prevention, accounting, or compliance purposes.',
    ],
  },
  {
    title: '7. Security',
    body: [
      'We use administrative, technical, and organizational safeguards designed to protect information from unauthorized access, loss, misuse, alteration, or disclosure. These safeguards include authenticated dashboard access, server-side API controls, protected access tokens, limited operational access, logging, and secure infrastructure practices.',
      'No online service can guarantee absolute security. If we learn of a security incident affecting personal information, we will take appropriate steps to investigate, contain, remediate, and notify affected parties when required.',
    ],
  },
  {
    title: '8. Your Choices and Rights',
    body: [
      'Business users may request access, correction, export, restriction, or deletion of their account data. Businesses can also update or delete contacts and suppress recipients who should not receive further messaging.',
      'WhatsApp end users may contact the business they messaged to request access, correction, or deletion of their conversation or contact data. Where required, Jaikvik WMS will assist the business customer in fulfilling valid data requests.',
    ],
  },
  {
    title: '9. Data Deletion Requests',
    body: [
      'To request deletion of data associated with Jaikvik WMS, email dm@jaikviktechnology.com with the subject line "Data Deletion Request". Include the account email, business name, WhatsApp Business Account or phone number involved, and a description of the data you want deleted.',
      'We may need to verify your identity or authority to act for the business before deleting data. After verification, we will delete or anonymize eligible data within a reasonable period, generally within 30 days, unless retention is required for legal, security, fraud-prevention, or compliance reasons.',
    ],
  },
  {
    title: '10. International Processing',
    body: [
      'Information may be processed and stored in locations where we or our service providers operate. When information is transferred internationally, we rely on appropriate safeguards required by applicable law.',
    ],
  },
  {
    title: '11. Children',
    body: [
      'Jaikvik WMS is a business application and is not intended for children. We do not knowingly collect personal information from children.',
    ],
  },
  {
    title: '12. Changes to This Policy',
    body: [
      'We may update this policy from time to time. The updated version will be posted on this page with a new effective date. Continued use of the service after an update means the revised policy applies to future use.',
    ],
  },
  {
    title: '13. Contact Us',
    body: [
      'For privacy questions, platform review questions, or data requests, contact us at dm@jaikviktechnology.com.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl rounded-lg border border-border bg-card px-5 py-7 shadow-card sm:px-8 sm:py-10">
        <header className="border-b border-border pb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Jaikvik WMS</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-sm text-muted-foreground">Effective date: July 14, 2026</p>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
            This policy explains how Jaikvik WMS collects, uses, shares, stores, and deletes data for its WhatsApp Business Platform dashboard and Meta integration.
          </p>
        </header>

        <div className="space-y-8 py-8">
          {sections.map(section => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
                {section.body.map(paragraph => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>Copyright 2026 Jaikvik WMS. All rights reserved.</p>
            <Link href="/login" className="font-medium text-primary hover:underline">
              Back to login
            </Link>
          </div>
        </footer>
      </article>
    </main>
  );
}
