import { Badge } from '@/components/ui';

export default function AccountSecuritySummary({ member }) {
  const admin = member.role === 'admin';
  const verifiedSecondary = Boolean(member.secondaryEmail && member.secondaryEmailVerifiedAt);
  const destination = admin ? 'Admin recipient selected at login' : member.useSecondaryEmailForOtp && verifiedSecondary ? member.secondaryEmail : member.email;
  return <div className="space-y-2 text-xs">
    <div className="flex flex-wrap gap-1.5">
      <Badge label={member.twoFactorEnabled ? '2FA enabled' : '2FA disabled'} color={member.twoFactorEnabled ? 'green' : 'gray'} />
      <Badge label={member.emailVerified ? 'Email verified' : 'Email verification pending'} color={member.emailVerified ? 'green' : 'yellow'} />
    </div>
    {!member.emailVerified && <p className="text-muted-foreground">Registered email must be verified before the next sign-in completes.</p>}
    {!admin && <div><p className="text-muted-foreground">Secondary email</p><p className="break-all">{member.secondaryEmail || 'Not linked'}{member.secondaryEmail ? verifiedSecondary ? ' (verified)' : ' (unverified)' : ''}</p></div>}
    <div><p className="text-muted-foreground">{member.twoFactorEnabled ? 'Login OTP destination' : 'OTP destination when 2FA is enabled'}</p><p className="break-all">{destination}</p></div>
    {admin && <p className="text-muted-foreground">Admin recipients are managed in the server environment.</p>}
  </div>;
}
