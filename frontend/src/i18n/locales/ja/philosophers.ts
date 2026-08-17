// philosophers ドメイン——「哲学者とチャット」機能（選択画面＋対話画面）。
// 落ち着いた丁寧な語り口。{var} プレースホルダーはそのまま保持します。
// 哲学者の名前・伝統・紹介文はバックエンド（英語コンテンツ）から届くため、ここには含めません。
export const philosophers: Record<string, string> = {
  // ── ページ全体 ────────────────────────────────────────────────────────────
  'philosophers.title': '哲学者とチャット',
  'philosophers.subtitle': 'ガイドを選び、その伝統の精神にふれながら一緒に振り返りましょう。',
  'philosophers.disclaimer': '振り返りのための相手であり、セラピストや医療的なアドバイスではありません。',

  // ── 選択画面 ──────────────────────────────────────────────────────────────
  'philosophers.pickerHeading': 'ガイドを選ぶ',
  'philosophers.loading': 'ガイドを読み込み中…',
  'philosophers.loadError': 'ガイドを読み込めませんでした。',
  'philosophers.empty': '現在ご利用いただけるガイドはありません。',
  'philosophers.choose': '{name}とチャットする',

  // ── 対話画面 ──────────────────────────────────────────────────────────────
  'philosophers.savedHeading': 'これまでの対話',
  'philosophers.deleteConvo': '対話を削除：{title}',

  'philosophers.change': '別のガイドを選ぶ',
  'philosophers.intro': '静かに振り返るための場所です。心にあることを話してみてください。{name}が{tradition}の精神で応えます。',
  'philosophers.youLabel': 'あなた',
  'philosophers.practiceSuggestion': '{name}の精神にふれるプラクティス',
  // Openers——チャットが空のときに表示される、タップできる書き出し。書き出しの文言自体は
  // 英語コンテンツ（バックエンドの各人物の候補、または今日の実践についての一文）で、
  // これらのキーは周りの表示のみです。
  'philosophers.startersHeading': 'まずはここから',
  'philosophers.openerAria': 'この言葉から始める：{text}',
  'philosophers.composerAria': 'メッセージ',
  'philosophers.composerPlaceholder': 'いま心にあることは？',
  'philosophers.send': '送信',
  'philosophers.sending': '送信中…',
  'philosophers.thinking': '{name}が考えています…',

  // ── お知らせ ──────────────────────────────────────────────────────────────
  'philosophers.error': 'うまく送信できませんでした。もう一度お試しください。',
  'philosophers.capReached': '今日はここまでにしましょう。また明日どうぞ。',
  'philosophers.guestBlocked': 'ガイドとチャットするにはアカウントを保存してください。',
  'philosophers.guestNote': 'ゲストとして体験中です——お試しで数回メッセージを送れます。',
  'philosophers.guestCapReached': '本日のゲスト利用はここまでです。',
  'philosophers.createAccount': '無料アカウントを作成',
}
