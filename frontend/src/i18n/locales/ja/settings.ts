// settings domain (日本語) — 設定ページ + プッシュ通知トグル + デイリーミッションの選択。
// 落ち着いた、ていねいな表現（です・ます）。{var} プレースホルダーは英語版と同一に保つこと。
export const settings: Record<string, string> = {
  'settings.title': '設定',

  // アカウントの保存（ゲスト → メンバー）
  'settings.claim.heading': 'アカウントを保存',
  'settings.claim.desc': 'メールアドレスとパスワードを登録すると、次回もログインでき、進捗を残せます。',
  'settings.claim.email': 'メールアドレス',
  'settings.claim.password': 'パスワード',
  'settings.claim.confirm': 'パスワード（確認）',
  'settings.claim.submit': 'アカウントを保存',
  'settings.claim.err.email': 'メールアドレスを入力してください。',
  'settings.claim.err.short': 'パスワードは 8 文字以上にしてください。',
  'settings.claim.err.mismatch': 'パスワードが一致しません。',
  'settings.claim.err.taken': 'そのメールアドレスはすでに登録されています。',

  // アカウント
  'settings.account.heading': 'アカウント',
  'settings.account.email': 'メールアドレス',
  'settings.account.guest': 'ゲストアカウント（未保存）',
  'settings.account.memberSince': '登録日',

  // ユーザー名
  'settings.username.heading': 'ユーザー名',
  'settings.username.desc': '公開される名前です。メールアドレスの代わりに表示されます。',
  'settings.username.label': 'ユーザー名',
  'settings.username.ok': 'ユーザー名を更新しました。',
  'settings.username.submit': 'ユーザー名を保存',
  'settings.username.err.format': '3〜20 文字：英字・数字・アンダースコアのみ使えます。',
  'settings.username.err.same': 'すでにそのユーザー名になっています。',
  'settings.username.err.taken': 'そのユーザー名は使われています。',

  // メールアドレスの変更
  'settings.email.heading': 'メールアドレスの変更',
  'settings.email.desc': '新しいアドレスに送られる確認リンクを開いて、認証を完了してください。',
  'settings.email.new': '新しいメールアドレス',
  'settings.email.current': '現在のパスワード',
  'settings.email.ok': 'メールアドレスを更新しました。受信トレイを確認して認証してください。',
  'settings.email.submit': 'メールアドレスを変更',
  'settings.email.err.enter': '新しいメールアドレスを入力してください。',
  'settings.email.err.same': 'すでにそのメールアドレスになっています。',
  'settings.email.err.password': '確認のため、現在のパスワードを入力してください。',
  'settings.email.err.taken': 'そのメールアドレスはすでに登録されています。',
  'settings.email.err.wrong': 'パスワードが正しくありません。',

  // パスワード
  'settings.password.headingChange': 'パスワードの変更',
  'settings.password.headingSet': 'パスワードの設定',
  'settings.password.googleNote':
    'このアカウントは Google でログインしています。パスワードを設定すると、メールアドレスでもログインできます。',
  'settings.password.current': '現在のパスワード',
  'settings.password.new': '新しいパスワード',
  'settings.password.confirm': '新しいパスワード（確認）',
  'settings.password.okChanged': 'パスワードを変更しました。',
  'settings.password.okSet': 'パスワードを設定しました。',
  'settings.password.submitChange': 'パスワードを変更',
  'settings.password.submitSet': 'パスワードを設定',
  'settings.password.err.short': '新しいパスワードは 8 文字以上にしてください。',
  'settings.password.err.mismatch': '新しいパスワードが一致しません。',
  'settings.password.err.current': '現在のパスワードを入力してください。',
  'settings.password.err.wrong': '現在のパスワードが正しくありません。',

  // デイリーミッション
  'settings.missions.heading': 'デイリーミッション',
  'settings.missions.desc': 'デイリーミッションの対象にするプラクティスを選びましょう（3 つ以上）。',
  'settings.missions.legend': 'デイリーミッションのプラクティス',
  'settings.missions.ok': 'ミッションの設定を保存しました。',
  'settings.missions.submit': 'ミッションを保存',
  'settings.missions.tooFew': '{min} つ以上えらんでください。',
  'settings.missions.feature.meditate': '瞑想',
  'settings.missions.feature.breathe': '呼吸',
  'settings.missions.feature.gratitude': '感謝',
  'settings.missions.feature.journal': 'ジャーナル',

  // プラクティスのリマインダー
  'settings.reminders.heading': 'プラクティスのリマインダー',
  'settings.reminders.desc':
    'お住まいの地域の時刻に、やさしいメールを毎日お送りします。すでにプラクティスした日は送りません。',
  'settings.reminders.enable': 'プラクティスのリマインダーメールを毎日受け取る',
  'settings.reminders.time': '時刻',
  'settings.reminders.streakSave': '連続記録が途切れそうなときは、夜にそっとお知らせする',
  'settings.reminders.ok': 'リマインダーの設定を保存しました。',
  'settings.reminders.submit': 'リマインダーを保存',
  'settings.reminders.err.partial':
    'リマインダーの時刻は保存しましたが、連続記録のお知らせを更新できませんでした。もう一度お試しください。',

  // 週間サマリー
  'settings.summary.heading': '週間サマリー',
  'settings.summary.desc':
    '1 週間の振り返り（分数・連続記録・いちばん多かった気分）をメールでお送りします。選んだ曜日の朝に届きます。',
  'settings.summary.enable': '週間サマリーをメールで受け取る',
  'settings.summary.day': '曜日',
  'settings.summary.ok': '週間サマリーの設定を保存しました。',
  'settings.summary.submit': '週間サマリーを保存',

  // プッシュ通知（PushToggle）
  'settings.push.heading': 'プッシュ通知',
  'settings.push.desc':
    'この端末で、プラクティスのうながしをプッシュ通知で受け取れます（メールとあわせて）。インストール版のアプリで使えます。',
  'settings.push.enable': 'プッシュ通知をオンにする',
  'settings.push.disable': 'プッシュ通知をオフにする',
  'settings.push.busy': '…',
  'settings.push.on': 'この端末でプッシュ通知がオンになりました。',
  'settings.push.off': 'プッシュ通知をオフにしました。',
  'settings.push.err': 'プッシュ通知を変更できませんでした。',
  // 有効化に失敗した理由のコード（services/push.ts の PushError → PushToggle が対応付け）
  'settings.push.error.noServiceWorker':
    'プッシュ通知にはインストール版のアプリが必要です（ここではサービスワーカーが動いていません）。',
  'settings.push.error.notConfigured': 'プッシュ通知はまだサーバー側で設定されていません。',
  'settings.push.error.permissionDenied': '通知が許可されませんでした。',

  // タイムゾーン
  'settings.timezone.heading': 'タイムゾーン',
  'settings.timezone.desc':
    'ブラウザから設定されます。連続記録やミッションは、お住まいの地域の深夜に切り替わります。',

  // 外観（言語のキーは common にあります）
  'settings.appearance.heading': '外観',
  'settings.season.desc': '季節の色あいが背景をいろどります。ひとつ選ぶか、暦にまかせることもできます。',
  'settings.season.label': '季節',
  'settings.season.auto': '自動（日付に合わせる）',
  'settings.season.winter': '冬',
  'settings.season.spring': '春',
  'settings.season.summer': '夏',
  'settings.season.autumn': '秋',
  'settings.season.now': '表示中：{season}',
  'settings.season.autoSuffix': '（自動）',
  'settings.phase.dawn': '明け方',
  'settings.phase.day': '昼',
  'settings.phase.dusk': '夕暮れ',
  'settings.phase.night': '夜',
  'settings.sounds': 'インターフェースの音（操作したときの、そっとしたクリック音）',

  // データ（書き出し・削除）
  'settings.data.heading': 'あなたのデータ',
  'settings.data.desc': 'アカウントを JSON で書き出すか、すべてのデータごと完全に削除できます。',
  'settings.data.export': 'データを書き出す',
  'settings.data.exporting': '準備しています…',
  'settings.data.delete': 'アカウントを削除',
  'settings.data.confirm':
    'アカウントと、その中のすべて（セッション・ジャーナル・感謝・ゴール・スピリット）が完全に削除されます。元に戻すことはできません。',
  'settings.data.deletePermanently': '完全に削除する',
  'settings.data.deleting': '削除しています…',
  'settings.data.err.export': 'データを書き出せませんでした。もう一度お試しください。',
  'settings.data.err.delete': 'アカウントを削除できませんでした。もう一度お試しください。',
}
