// Common domain — Japanese. Calm, polite register (です/ます where sentences occur); nav labels
// use the natural conventions of Japanese wellness apps (katakana loans where they read better).
export const common: Record<string, string> = {
  'nav.home': 'ホーム',
  'nav.practice': 'プラクティス',
  'nav.progress': '進捗',
  'nav.spirit': 'スピリット',
  'nav.menu': 'メニュー',

  'nav.breathe': '呼吸',
  'nav.meditate': '瞑想',
  'nav.trataka': 'キャンドル瞑想',
  'nav.gratitude': '感謝',
  'nav.journal': 'ジャーナル',
  'nav.paths': 'コース',
  'nav.allPractices': 'プラクティス一覧',
  'nav.logSession': 'セッションを記録',

  'nav.analytics': '分析',
  'nav.timeline': 'タイムライン',
  'nav.goals': '目標',
  'nav.schedule': 'スケジュール',
  'nav.settings': '設定',
  'nav.admin': '管理',

  'user.level': 'Lv {level}',
  'user.logout': 'ログアウト',

  'needs.nourished': '滋養',
  'needs.rested': '休息',
  'needs.joyful': '喜び',
  'needs.short.nourished': '滋養',
  'needs.short.rested': '休息',
  'needs.short.joyful': '喜び',

  'needChip.label': '{need}を少し？',
  'needChip.title': '{name}は最近{need}が少なめです — 少し補うとバランスが整います',
  'needChip.fallbackName': 'あなたのスピリット',

  'common.save': '保存',
  'common.cancel': 'キャンセル',
  'common.delete': '削除',
  'common.close': '閉じる',
  'common.backHome': '← ホーム',
  'common.backDashboard': '← ダッシュボード',
  'common.loading': '読み込み中…',
  'common.saving': '保存中…',
  'common.optional': '（任意）',
  'common.gotIt': 'わかりました',
  'common.min_other': '{count}分',
  'common.yourLocalTime': 'お住まいの地域の時刻',

  // 共有の状態表示（StateViews.tsx）— 読み込み・再試行のデフォルト
  'common.oneMoment': '少々お待ちください…',
  'common.tryAgain': 'もう一度',
  'common.retrying': '再試行中…',
  'common.coins': 'コイン',

  // 公開フッター（SiteFooter.tsx）
  'footer.privacy': 'プライバシー',
  'footer.terms': '利用規約',

  // 404（NotFoundPage.tsx）
  'notFound.title': 'ページが見つかりません',
  'notFound.body': 'このパスの先には何もありません。なくなったか、もともと無かったようです。',
  'notFound.back': '← ホームに戻る',

  // API失敗時の文言（lib/errors.ts）— ネットワーク起因とサーバー側起因を区別
  'common.error.network': 'サーバーに接続できません — 通信環境を確認して、もう一度お試しください。',
  'common.error.server': 'こちら側で問題が起きました。少し待ってから、もう一度お試しください。',

  // 描画エラーのフォールバック（ErrorBoundary.tsx）
  'error.title': '問題が発生しました',
  'error.body': '予期しないエラーでこのページが表示できませんでした。たいていは再読み込みで直ります。',
  'error.reload': 'アプリを再読み込み',

  'settings.language': '言語',
  'settings.language.note':
    'すぐに反映されます。長文コンテンツ（今日の一節・ガイド音声の台本など）は当面英語のままです。',
}
