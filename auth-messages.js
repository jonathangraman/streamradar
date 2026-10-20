export function authMessage(error){
 const code=error?.code;
 if(code==='email_not_confirmed')return 'Confirm your email first. Use Resend confirmation, or continue with Google.';
 if(code==='email_address_not_authorized')return 'Email delivery is not yet configured for this address. Continue with Google, or try again after email setup is complete.';
 if(code==='over_email_send_rate_limit'||code==='over_request_rate_limit')return 'Too many requests. Wait a little before trying again, or continue with Google.';
 if(code==='otp_expired')return 'This email link has expired or was already used. Request a fresh link.';
 if(code==='invalid_credentials')return 'The email or password is incorrect.';
 return error?.message||'Could not complete that request. Please try again.';
}
