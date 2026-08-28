import { siteUrl } from '../../lib/supabaseClient';

function siteHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
}

export default function ConfirmationMessage({ email }) {
  const host = siteHost(siteUrl);
  const loginUrl = `${siteUrl}/login`;

  return (
    <div className="max-w-md w-full mx-auto p-6">
      <h2 className="text-2xl font-bold text-center text-charcoal mb-6">Registration Successful</h2>
      
      <div className="p-4 bg-green-50 text-green-700 rounded-lg mb-6 border border-green-200">
        <p className="font-semibold mb-2">Please verify your email address</p>
        <p>
          We've sent a confirmation link to: <span className="font-semibold break-all">{email}</span>
        </p>
      </div>
      
      <div className="text-gray-600">
        <p className="mb-3">
          To complete your registration, please check your email inbox and click the confirmation link.
        </p>
        <p className="mb-3">
          After confirmation, you'll be redirected to <span className="font-semibold">{host}</span> where you can log in.
        </p>
        <div className="bg-blue-50 p-3 rounded-lg text-blue-700 text-sm border border-blue-200">
          <p className="font-semibold mb-1">Note:</p>
          <p>If you're redirected back to this page after clicking the confirmation link, please manually go to <a href={loginUrl} className="text-blue-600 underline">{host}/login</a> to sign in.</p>
        </div>
      </div>
    </div>
  );
}
