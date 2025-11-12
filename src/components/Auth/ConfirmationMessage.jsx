export default function ConfirmationMessage({ email }) {
  return (
    <div className="max-w-md w-full mx-auto p-6">
      <h2 className="text-2xl font-bold text-center text-charcoal dark:text-white mb-6">Registration Successful</h2>
      
      <div className="p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg mb-6 border border-green-200 dark:border-green-800">
        <p className="font-semibold mb-2">Please verify your email address</p>
        <p>
          We've sent a confirmation link to: <span className="font-semibold break-all">{email}</span>
        </p>
      </div>
      
      <div className="text-gray-600 dark:text-gray-400">
        <p className="mb-3">
          To complete your registration, please check your email inbox and click the confirmation link.
        </p>
        <p className="mb-3">
          After confirmation, you'll be redirected to <span className="font-semibold">shunters.net</span> where you can log in.
        </p>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-blue-700 dark:text-blue-400 text-sm border border-blue-200 dark:border-blue-800">
          <p className="font-semibold mb-1">Note:</p>
          <p>If you're redirected back to this page after clicking the confirmation link, please manually go to <a href="https://shunters.net/login" className="text-blue-600 dark:text-blue-400 underline">shunters.net/login</a> to sign in.</p>
        </div>
      </div>
    </div>
  );
} 