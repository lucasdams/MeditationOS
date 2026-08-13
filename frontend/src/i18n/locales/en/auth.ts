// auth domain — filled by the page-cluster migration. Keys: 'auth.*'. EN is source of truth.
// Every value here MUST stay byte-identical to the literal it replaced (the test suite asserts
// exact English text): same words, punctuation, casing, em-dashes, and curly apostrophes.
export const auth: Record<string, string> = {
  // ── AuthBrand ──
  'auth.brand.tagline': 'Your meditation practice, tracked.',

  // ── LandingPage ──
  'auth.landing.tagline.pre': 'A meditation app built around ',
  'auth.landing.tagline.emphasis': 'your practice data',
  'auth.landing.tagline.post':
    ' — not another audio library. Track sessions, build streaks, and watch the habit take hold.',
  'auth.landing.getStarted': 'Get started — it’s free',
  'auth.landing.login': 'Log in',
  'auth.landing.noSignup': 'No sign-up needed to try it.',
  // Feature grid
  'auth.landing.feature.timer.title': 'Meditation timer',
  'auth.landing.feature.timer.body':
    'Unguided “sit now” sessions with a calm timer, optional start / interval / end bells, and timing that survives a backgrounded tab.',
  'auth.landing.feature.breathing.title': 'HRV resonance breathing',
  'auth.landing.feature.breathing.body':
    'A guided pacer at your chosen slow rate, with an ocean-breath audio guide and a breathing circle to follow.',
  'auth.landing.feature.gratitude.title': 'Gratitude',
  'auth.landing.feature.gratitude.body':
    'Capture small moments of gratitude across 37 themes — with AI-suggested prompts, or write your own.',
  'auth.landing.feature.journal.title': 'Journal',
  'auth.landing.feature.journal.body':
    'Reflect on a sit, tag a mood, and resurface a random past entry to revisit.',
  'auth.landing.feature.trataka.title': 'Candle gazing',
  'auth.landing.feature.trataka.body':
    'An eyes-open focus practice (traditionally called Trataka) — rest your attention on a single, gently moving flame to steady a busy mind.',
  'auth.landing.feature.goals.title': 'Goals',
  'auth.landing.feature.goals.body':
    'Set recurring habits — meditate, breathe, journal — and watch progress fill in automatically from your activity.',
  'auth.landing.feature.spirit.title': 'Spirit',
  'auth.landing.feature.spirit.body':
    'Awaken a living companion you raise through practice — it evolves down a path shaped by how you meditate, and needs your care to thrive.',
  'auth.landing.feature.analytics.title': 'Dashboard & analytics',
  'auth.landing.feature.analytics.body':
    'Streaks, levels, a weekly breakdown, an activity heatmap, and trends across type, day, and time.',
  'auth.landing.feature.streaks.title': 'Streaks, XP & missions',
  'auth.landing.feature.streaks.body':
    'Rotating daily missions, XP and levels, and a streak with a forgiving rest day — gentle, not grindy.',

  // ── LoginPage ──
  'auth.login.title': 'Log in',
  'auth.login.sessionExpired': 'Your session expired. Please log in again.',
  'auth.login.invalidEmail': 'Please enter a valid email address.',
  'auth.login.missingPassword': 'Please enter your password.',
  'auth.login.invalidCredentials': 'Invalid email or password.',
  'auth.login.tooManyAttempts': 'Too many attempts. Please wait a moment and try again.',
  'auth.login.emailLabel': 'Email',
  'auth.login.passwordLabel': 'Password',
  'auth.login.rememberMe': 'Keep me signed in',
  'auth.login.submitting': 'Logging in…',
  'auth.login.cta': 'Log in',
  'auth.login.forgotPassword': 'Forgot password?',
  'auth.login.or': 'or',
  'auth.login.noAccount.text': 'No account? ',
  'auth.login.noAccount.link': 'Register',

  // ── RegisterPage ──
  'auth.register.title': 'Create your account',
  'auth.register.invalidEmail': 'Please enter a valid email address.',
  'auth.register.passwordTooShort': 'Password must be at least 8 characters.',
  'auth.register.emailTaken': 'That email is already registered.',
  'auth.register.emailLabel': 'Email',
  'auth.register.passwordLabel': 'Password',
  'auth.register.passwordHint': 'At least 8 characters.',
  'auth.register.submitting': 'Creating…',
  'auth.register.cta': 'Create account',
  'auth.register.legal.pre': 'By creating an account you agree to our ',
  'auth.register.legal.terms': 'Terms',
  'auth.register.legal.and': ' and ',
  'auth.register.legal.privacy': 'Privacy Policy',
  'auth.register.legal.post': '.',
  'auth.register.or': 'or',
  'auth.register.haveAccount.text': 'Already have an account? ',
  'auth.register.haveAccount.link': 'Log in',

  // ── ChooseUsername ──
  'auth.chooseUsername.title': 'Pick a username',
  'auth.chooseUsername.intro':
    'This is the name shown in the app instead of your email. You can change it later in Settings.',
  'auth.chooseUsername.tooShort': 'A little longer, please — at least {min} characters.',
  'auth.chooseUsername.taken': 'That username is taken — try another.',
  'auth.chooseUsername.label': 'Username',
  'auth.chooseUsername.placeholder': 'e.g. calm_otter',
  'auth.chooseUsername.hint': '{min}–{max} characters · letters, numbers, and underscores',
  'auth.chooseUsername.submitting': 'Saving…',
  'auth.chooseUsername.cta': 'Continue',

  // ── VerifyEmailPage ──
  'auth.verify.title': 'Email verification',
  'auth.verify.verifying': 'Verifying your email…',
  'auth.verify.ok': 'Email confirmed — you’re all set.',
  'auth.verify.missingToken': 'This verification link is missing its token.',
  'auth.verify.invalidToken': 'This link is invalid or has expired.',
  'auth.verify.resendPrompt': 'We can send a fresh confirmation link to {email}.',
  'auth.verify.resent': 'Sent — check your inbox.',
  'auth.verify.resending': 'Sending…',
  'auth.verify.resendCta': 'Send a new link',
  'auth.verify.throttled':
    'You’ve requested a few links recently. Please wait a moment, then try again.',
  'auth.verify.resendError': 'Couldn’t send the link. Please try again shortly.',
  'auth.verify.loginToResend': 'Log in to request a new confirmation link.',
  'auth.verify.goDashboard': 'Go to dashboard',
  'auth.verify.goLogin': 'Go to log in',

  // ── ForgotPasswordPage ──
  'auth.forgot.missingEmail': 'Please enter your email.',
  'auth.forgot.sentTitle': 'Check your email',
  'auth.forgot.sent.pre': 'If an account exists for ',
  'auth.forgot.sent.post':
    ', a link to reset your password is on its way. The link expires in 30 minutes.',
  'auth.forgot.backToLogin': 'Back to log in',
  'auth.forgot.title': 'Reset your password',
  'auth.forgot.intro': 'Enter your email and we’ll send you a reset link.',
  'auth.forgot.emailLabel': 'Email',
  'auth.forgot.submitting': 'Sending…',
  'auth.forgot.cta': 'Send reset link',

  // ── ResetPasswordPage ──
  'auth.reset.passwordTooShort': 'New password must be at least 8 characters.',
  'auth.reset.mismatch': 'The passwords don’t match.',
  'auth.reset.invalidToken': 'This reset link is invalid or has expired. Request a new one.',
  'auth.reset.doneTitle': 'Password reset',
  'auth.reset.doneBody': 'Your password has been changed. You can now log in with it.',
  'auth.reset.goLogin': 'Go to log in',
  'auth.reset.missingTokenTitle': 'Reset your password',
  'auth.reset.missingToken': 'This reset link is missing its token. Request a new one.',
  'auth.reset.requestLink': 'Request a reset link',
  'auth.reset.title': 'Choose a new password',
  'auth.reset.newPasswordLabel': 'New password',
  'auth.reset.confirmLabel': 'Confirm new password',
  'auth.reset.submitting': 'Saving…',
  'auth.reset.cta': 'Reset password',
  'auth.reset.backToLogin': 'Back to log in',

  // ── Onboarding ──
  'auth.onboarding.title': 'Welcome',
  'auth.onboarding.intro':
    'One gentle question, then we’ll take a slow minute together. No pressure — you can change anything later in Settings.',
  'auth.onboarding.question': 'What brings you here?',
  'auth.onboarding.intent.calm.label': 'Calm',
  'auth.onboarding.intent.calm.sub': 'Stress relief',
  'auth.onboarding.intent.focus.label': 'Focus',
  'auth.onboarding.intent.focus.sub': 'Clarity & attention',
  'auth.onboarding.intent.sleep.label': 'Better sleep',
  'auth.onboarding.intent.sleep.sub': 'Wind down & rest',
  'auth.onboarding.intent.curious.label': 'Just curious',
  'auth.onboarding.intent.curious.sub': 'Exploring',

  // ── GoogleSignInButton ──
  'auth.google.error': 'Google sign-in failed. Please try again.',

  // ── GuestBanner ──
  'auth.guestBanner.text.pre': 'You’re a guest — your progress lives only in this browser and is lost for good if cookies are cleared. Add an email so you don’t lose it.',
  'auth.guestBanner.cta': 'Save my account',

  // ── CookieNotice ──
  'auth.cookieNotice.aria': 'Cookie notice',
  'auth.cookieNotice.text.pre':
    'We use one essential cookie to keep you signed in — no third-party tracking. See our ',
  'auth.cookieNotice.text.privacy': 'Privacy Policy',
  'auth.cookieNotice.text.post': '.',
  'auth.cookieNotice.cta': 'Got it',

  // ── VerifyEmailBanner (VerifyEmailBanner.tsx) ── reuses auth.verify.resent / .resending
  'auth.verifyBanner.please': 'Please verify your email ({email}) to secure your account.',
  'auth.verifyBanner.resend': 'Resend link',
  'auth.verifyBanner.error': 'Couldn’t send — try again shortly.',

  // ── ConfirmEmailGate (ConfirmEmailGate.tsx) ── reuses auth.verify.resent / .resending /
  //    .resendError and common user.logout
  'auth.confirmGate.title': 'Confirm your email',
  'auth.confirmGate.body.pre':
    'To keep your account secure, please confirm your email address before continuing. We sent a confirmation link to ',
  'auth.confirmGate.body.post': ' — open it to finish, then come back here.',
  'auth.confirmGate.checking': 'Checking…',
  'auth.confirmGate.confirmed': 'I’ve confirmed — continue',
  'auth.confirmGate.recheckFailed':
    'We still don’t see a confirmation. Open the link in your email, then try again.',
  'auth.confirmGate.didntGet': 'Didn’t get it? ',
  'auth.confirmGate.resendLink': 'Resend the link',
  'auth.confirmGate.throttled':
    'You’ve requested a few links recently. Please wait a moment before trying again.',
  'auth.confirmGate.wrongAddress': 'Wrong address? ',

  // ── GuestButton (GuestButton.tsx) ──
  'auth.guest.starting': 'Starting…',
  'auth.guest.continue': 'Continue as a guest',
  'auth.guest.error': "Couldn't start a guest session. Try again.",
}
