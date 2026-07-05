// settings domain (English) — SettingsPage + PushToggle + QuestPicker. English is the SOURCE OF
// TRUTH: every value stays byte-identical to the literal it replaced. {var} placeholders match JA.
export const settings: Record<string, string> = {
  'settings.title': 'Settings',

  // Claim (guest → member)
  'settings.claim.heading': 'Save your account',
  'settings.claim.desc': 'Add an email and password so you can log back in and keep your progress.',
  'settings.claim.email': 'Email',
  'settings.claim.password': 'Password',
  'settings.claim.confirm': 'Confirm password',
  'settings.claim.submit': 'Save account',
  'settings.claim.err.email': 'Enter an email.',
  'settings.claim.err.short': 'Password must be at least 8 characters.',
  'settings.claim.err.mismatch': 'The passwords don’t match.',
  'settings.claim.err.taken': 'That email already has an account.',

  // Account
  'settings.account.heading': 'Account',
  'settings.account.email': 'Email',
  'settings.account.guest': 'Guest account (not saved)',
  'settings.account.memberSince': 'Member since',

  // Username
  'settings.username.heading': 'Username',
  'settings.username.desc': 'Your public name — shown instead of your email.',
  'settings.username.label': 'Username',
  'settings.username.ok': 'Username updated.',
  'settings.username.submit': 'Save username',
  'settings.username.err.format': '3–20 characters: letters, numbers, and underscores only.',
  'settings.username.err.same': 'That’s already your username.',
  'settings.username.err.taken': 'That username is taken.',

  // Change email
  'settings.email.heading': 'Change email',
  'settings.email.desc': 'You’ll need to confirm a verification link sent to the new address.',
  'settings.email.new': 'New email',
  'settings.email.current': 'Current password',
  'settings.email.ok': 'Email updated — check your inbox to verify it.',
  'settings.email.submit': 'Change email',
  'settings.email.err.enter': 'Enter a new email.',
  'settings.email.err.same': 'That’s already your email.',
  'settings.email.err.password': 'Enter your current password to confirm.',
  'settings.email.err.taken': 'That email already has an account.',
  'settings.email.err.wrong': 'Your password is incorrect.',

  // Password
  'settings.password.headingChange': 'Change password',
  'settings.password.headingSet': 'Set a password',
  'settings.password.googleNote':
    'Your account uses Sign in with Google. Set a password to also log in with your email.',
  'settings.password.current': 'Current password',
  'settings.password.new': 'New password',
  'settings.password.confirm': 'Confirm new password',
  'settings.password.okChanged': 'Password changed.',
  'settings.password.okSet': 'Password set.',
  'settings.password.submitChange': 'Change password',
  'settings.password.submitSet': 'Set password',
  'settings.password.err.short': 'New password must be at least 8 characters.',
  'settings.password.err.mismatch': 'The new passwords don’t match.',
  'settings.password.err.current': 'Enter your current password.',
  'settings.password.err.wrong': 'Your current password is incorrect.',

  // Daily missions
  'settings.missions.heading': 'Daily missions',
  'settings.missions.desc': 'Choose which practices you get daily missions for — at least {min}.',
  'settings.missions.legend': 'Daily mission practices',
  'settings.missions.ok': 'Mission preferences saved.',
  'settings.missions.submit': 'Save missions',
  'settings.missions.tooFew': 'Pick at least {min}.',
  'settings.missions.feature.meditate': 'Meditate',
  'settings.missions.feature.breathe': 'Breathe',
  'settings.missions.feature.gratitude': 'Gratitude',
  'settings.missions.feature.journal': 'Journal',

  // Practice reminders
  'settings.reminders.heading': 'Practice reminders',
  'settings.reminders.desc':
    'A gentle daily email at your local time, skipped on days you’ve already practiced.',
  'settings.reminders.enable': 'Email me a daily reminder to practice',
  'settings.reminders.time': 'Time of day',
  'settings.reminders.streakSave': 'Also send a gentle evening nudge if my streak is at risk',
  'settings.reminders.ok': 'Reminder preferences saved.',
  'settings.reminders.submit': 'Save reminders',
  'settings.reminders.err.partial':
    'Your reminder time was saved, but the streak-save nudge couldn’t be updated. Please try again.',

  // Weekly summary
  'settings.summary.heading': 'Weekly summary',
  'settings.summary.desc':
    'A weekly email recap — minutes, streak, and your most-logged mood. Sent the morning of your chosen day.',
  'settings.summary.enable': 'Email me a weekly summary',
  'settings.summary.day': 'Day of week',
  'settings.summary.ok': 'Weekly summary preferences saved.',
  'settings.summary.submit': 'Save weekly summary',

  // Push notifications (PushToggle)
  'settings.push.heading': 'Push notifications',
  'settings.push.desc':
    'Get practice nudges as push notifications on this device (alongside email). Available in the installed app.',
  'settings.push.enable': 'Enable push',
  'settings.push.disable': 'Turn off push',
  'settings.push.busy': '…',
  'settings.push.on': 'Push notifications are on for this device.',
  'settings.push.off': 'Push notifications turned off.',
  'settings.push.err': 'Couldn’t change push notifications.',

  // Timezone
  'settings.timezone.heading': 'Timezone',
  'settings.timezone.desc':
    'Set from your browser, so streaks and quests roll over at your local midnight.',

  // Appearance (language keys live in common)
  'settings.appearance.heading': 'Appearance',
  'settings.season.desc': 'A seasonal tint colors the background. Pick one, or let it follow the calendar.',
  'settings.season.label': 'Season',
  'settings.season.auto': 'Auto (by date)',
  'settings.season.winter': 'Winter',
  'settings.season.spring': 'Spring',
  'settings.season.summer': 'Summer',
  'settings.season.autumn': 'Autumn',
  'settings.season.now': 'Now showing: {season}',
  'settings.season.autoSuffix': ' (auto)',
  'settings.phase.dawn': 'dawn',
  'settings.phase.day': 'day',
  'settings.phase.dusk': 'dusk',
  'settings.phase.night': 'night',
  'settings.sounds': 'Interface sounds (a soft tick when you tap controls)',

  // Your data (export / delete)
  'settings.data.heading': 'Your data',
  'settings.data.desc': 'Download your account as JSON, or permanently delete it and all its data.',
  'settings.data.export': 'Export my data',
  'settings.data.exporting': 'Preparing…',
  'settings.data.delete': 'Delete account',
  'settings.data.confirm':
    'This permanently deletes your account and everything in it — sessions, journal, gratitude, goals, and your spirit companion. This can’t be undone.',
  'settings.data.deletePermanently': 'Delete permanently',
  'settings.data.deleting': 'Deleting…',
  'settings.data.err.export': 'Couldn’t export your data. Try again.',
  'settings.data.err.delete': 'Couldn’t delete your account. Try again.',
}
