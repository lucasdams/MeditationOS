// auth domain (Japanese) — calm, polite register (です/ます for sentences; concise labels/buttons).
// Keep the SAME {var} placeholders as the English catalog. Keys mirror en/auth.ts.
export const auth: Record<string, string> = {
  // ── AuthBrand ──
  'auth.brand.tagline': 'あなたの瞑想の実践を、記録しましょう。',

  // ── LandingPage ──
  'auth.landing.tagline.pre': '音声ライブラリではなく、',
  'auth.landing.tagline.emphasis': 'あなたの実践データ',
  'auth.landing.tagline.post':
    'を軸にした瞑想アプリです。セッションを記録し、連続日数を積み重ね、習慣が根づいていく様子を見守りましょう。',
  'auth.landing.getStarted': 'はじめる — 無料です',
  'auth.landing.login': 'ログイン',
  'auth.landing.noSignup': '登録なしでお試しいただけます。',
  // Feature grid
  'auth.landing.feature.timer.title': '瞑想タイマー',
  'auth.landing.feature.timer.body':
    '穏やかなタイマーで行う、ガイドなしの「今すぐ座る」セッション。開始・区切り・終了のベルは任意で設定でき、タブを閉じても計測は続きます。',
  'auth.landing.feature.breathing.title': 'HRVレゾナンス呼吸法',
  'auth.landing.feature.breathing.body':
    'お好みのゆっくりとしたペースに合わせたガイド。海の波のような呼吸の音声ガイドと、なぞって呼吸を整える呼吸サークルつきです。',
  'auth.landing.feature.gratitude.title': '感謝',
  'auth.landing.feature.gratitude.body':
    '37のテーマにわたって、小さな感謝の瞬間を書き留めましょう。AIが提案するプロンプトを使っても、ご自身の言葉で書いても構いません。',
  'auth.landing.feature.journal.title': 'ジャーナル',
  'auth.landing.feature.journal.body':
    '座った後に振り返り、気分をタグづけし、過去の記録をランダムに呼び出して読み返せます。',
  'auth.landing.feature.trataka.title': 'キャンドル凝視',
  'auth.landing.feature.trataka.body':
    '目を開けたまま集中する実践（伝統的にはトラータカと呼ばれます）。ゆらめく一つの炎に意識を預け、ざわつく心を静めます。',
  'auth.landing.feature.goals.title': '目標',
  'auth.landing.feature.goals.body':
    '瞑想・呼吸・ジャーナルなど、繰り返す習慣を設定しましょう。あなたの活動から進捗が自動で埋まっていきます。',
  'auth.landing.feature.spirit.title': 'スピリット',
  'auth.landing.feature.spirit.body':
    '実践を通じて育てる、生きた仲間を目覚めさせましょう。あなたの瞑想の仕方によって道が形づくられ、進化していきます。健やかに育つには、あなたのお世話が必要です。',
  'auth.landing.feature.analytics.title': 'ダッシュボードと分析',
  'auth.landing.feature.analytics.body':
    '連続日数、レベル、週ごとの内訳、活動のヒートマップ、そして種類・曜日・時間帯ごとの傾向が見られます。',
  'auth.landing.feature.streaks.title': '連続日数・XP・ミッション',
  'auth.landing.feature.streaks.body':
    '日替わりのデイリーミッション、XPとレベル、そして休息日を許容する連続日数。厳しさではなく、やさしさを大切にしています。',

  // ── LoginPage ──
  'auth.login.title': 'ログイン',
  'auth.login.sessionExpired': 'セッションの有効期限が切れました。もう一度ログインしてください。',
  'auth.login.invalidEmail': '有効なメールアドレスを入力してください。',
  'auth.login.missingPassword': 'パスワードを入力してください。',
  'auth.login.invalidCredentials': 'メールアドレスまたはパスワードが正しくありません。',
  'auth.login.tooManyAttempts': '試行回数が多すぎます。少し時間をおいてから、もう一度お試しください。',
  'auth.login.emailLabel': 'メールアドレス',
  'auth.login.passwordLabel': 'パスワード',
  'auth.login.rememberMe': 'ログイン状態を保持する',
  'auth.login.submitting': 'ログインしています…',
  'auth.login.cta': 'ログイン',
  'auth.login.forgotPassword': 'パスワードをお忘れですか？',
  'auth.login.or': 'または',
  'auth.login.noAccount.text': 'アカウントをお持ちでないですか？ ',
  'auth.login.noAccount.link': '新規登録',

  // ── RegisterPage ──
  'auth.register.title': 'アカウントを作成',
  'auth.register.invalidEmail': '有効なメールアドレスを入力してください。',
  'auth.register.passwordTooShort': 'パスワードは8文字以上にしてください。',
  'auth.register.emailTaken': 'このメールアドレスはすでに登録されています。',
  'auth.register.emailLabel': 'メールアドレス',
  'auth.register.passwordLabel': 'パスワード',
  'auth.register.passwordHint': '8文字以上。',
  'auth.register.submitting': '作成しています…',
  'auth.register.cta': 'アカウントを作成',
  'auth.register.legal.pre': 'アカウントを作成すると、',
  'auth.register.legal.terms': '利用規約',
  'auth.register.legal.and': 'と',
  'auth.register.legal.privacy': 'プライバシーポリシー',
  'auth.register.legal.post': 'に同意したものとみなされます。',
  'auth.register.or': 'または',
  'auth.register.haveAccount.text': 'すでにアカウントをお持ちですか？ ',
  'auth.register.haveAccount.link': 'ログイン',

  // ── ChooseUsername ──
  'auth.chooseUsername.title': 'ユーザー名を選ぶ',
  'auth.chooseUsername.intro':
    'これはメールアドレスの代わりにアプリで表示される名前です。あとで設定から変更できます。',
  'auth.chooseUsername.tooShort': 'もう少し長くしてください — {min}文字以上でお願いします。',
  'auth.chooseUsername.taken': 'このユーザー名は使われています — 別のものをお試しください。',
  'auth.chooseUsername.label': 'ユーザー名',
  'auth.chooseUsername.placeholder': '例：calm_otter',
  'auth.chooseUsername.hint': '{min}〜{max}文字 · 半角英数字とアンダースコア',
  'auth.chooseUsername.submitting': '保存しています…',
  'auth.chooseUsername.cta': '続ける',

  // ── VerifyEmailPage ──
  'auth.verify.title': 'メールアドレスの確認',
  'auth.verify.verifying': 'メールアドレスを確認しています…',
  'auth.verify.ok': 'メールアドレスが確認できました — これで準備完了です。',
  'auth.verify.missingToken': 'この確認リンクにはトークンが含まれていません。',
  'auth.verify.invalidToken': 'このリンクは無効か、有効期限が切れています。',
  'auth.verify.resendPrompt': '{email} に新しい確認リンクをお送りできます。',
  'auth.verify.resent': '送信しました — 受信トレイをご確認ください。',
  'auth.verify.resending': '送信しています…',
  'auth.verify.resendCta': '新しいリンクを送る',
  'auth.verify.throttled':
    '最近リンクを何度かリクエストされています。少し時間をおいてから、もう一度お試しください。',
  'auth.verify.resendError': 'リンクを送信できませんでした。しばらくしてから、もう一度お試しください。',
  'auth.verify.loginToResend': '新しい確認リンクをリクエストするにはログインしてください。',
  'auth.verify.goDashboard': 'ダッシュボードへ',
  'auth.verify.goLogin': 'ログインへ',

  // ── ForgotPasswordPage ──
  'auth.forgot.missingEmail': 'メールアドレスを入力してください。',
  'auth.forgot.sentTitle': 'メールをご確認ください',
  'auth.forgot.sent.pre': 'もし ',
  'auth.forgot.sent.post':
    ' のアカウントが存在する場合、パスワードを再設定するためのリンクをお送りしています。リンクの有効期限は30分です。',
  'auth.forgot.backToLogin': 'ログインに戻る',
  'auth.forgot.title': 'パスワードを再設定',
  'auth.forgot.intro': 'メールアドレスを入力していただければ、再設定用のリンクをお送りします。',
  'auth.forgot.emailLabel': 'メールアドレス',
  'auth.forgot.submitting': '送信しています…',
  'auth.forgot.cta': '再設定リンクを送る',

  // ── ResetPasswordPage ──
  'auth.reset.passwordTooShort': '新しいパスワードは8文字以上にしてください。',
  'auth.reset.mismatch': 'パスワードが一致しません。',
  'auth.reset.invalidToken': 'この再設定リンクは無効か、有効期限が切れています。新しいものをリクエストしてください。',
  'auth.reset.doneTitle': 'パスワードを再設定しました',
  'auth.reset.doneBody': 'パスワードを変更しました。これで新しいパスワードでログインできます。',
  'auth.reset.goLogin': 'ログインへ',
  'auth.reset.missingTokenTitle': 'パスワードを再設定',
  'auth.reset.missingToken': 'この再設定リンクにはトークンが含まれていません。新しいものをリクエストしてください。',
  'auth.reset.requestLink': '再設定リンクをリクエスト',
  'auth.reset.title': '新しいパスワードを選ぶ',
  'auth.reset.newPasswordLabel': '新しいパスワード',
  'auth.reset.confirmLabel': '新しいパスワード（確認）',
  'auth.reset.submitting': '保存しています…',
  'auth.reset.cta': 'パスワードを再設定',
  'auth.reset.backToLogin': 'ログインに戻る',

  // ── Onboarding ──
  'auth.onboarding.title': 'ようこそ',
  'auth.onboarding.intro':
    'やさしい質問を一つ、それからゆっくりと一分間、ご一緒しましょう。焦らなくて大丈夫です — あとで設定からいつでも変更できます。',
  'auth.onboarding.question': '今日はどんな気持ちでいらっしゃいましたか？',
  'auth.onboarding.intent.calm.label': '落ち着き',
  'auth.onboarding.intent.calm.sub': 'ストレスの緩和',
  'auth.onboarding.intent.focus.label': '集中',
  'auth.onboarding.intent.focus.sub': '明晰さと注意力',
  'auth.onboarding.intent.sleep.label': 'よりよい睡眠',
  'auth.onboarding.intent.sleep.sub': '心を鎮めて休む',
  'auth.onboarding.intent.curious.label': 'ただ気になって',
  'auth.onboarding.intent.curious.sub': '探ってみる',

  // ── GoogleSignInButton ──
  'auth.google.error': 'Googleでのサインインに失敗しました。もう一度お試しください。',

  // ── GuestBanner ──
  'auth.guestBanner.text.pre': 'あなたはゲストです — 進捗はこのブラウザにのみ保存され、Cookieを消去すると完全に失われます。失わないよう、メールアドレスを追加しましょう。',
  'auth.guestBanner.cta': 'アカウントを保存',

  // ── CookieNotice ──
  'auth.cookieNotice.aria': 'Cookieに関するお知らせ',
  'auth.cookieNotice.text.pre':
    'ログイン状態を保つために、必須のCookieを1つだけ使用しています — サードパーティによるトラッキングはありません。詳しくは',
  'auth.cookieNotice.text.privacy': 'プライバシーポリシー',
  'auth.cookieNotice.text.post': 'をご覧ください。',
  'auth.cookieNotice.cta': '了解',
}
