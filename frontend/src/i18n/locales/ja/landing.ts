// landing ドメイン——ログアウト時の公開ホームページ（マーケティング）。キー: 'landing.*'。
// 英語がソース・オブ・トゥルース。文言はマーケティング的ですが、他の UI と同様にカタログで
// 管理し、ランディングページもローカライズします。
export const landing: Record<string, string> = {
  // ── ヒーロー ────────────────────────────────────────────────────────────────
  'landing.hero.eyebrow': 'データ中心の瞑想',
  // h1 は分割し、中央の語句にアクセントを付けて表示します。
  // `{titleLead}<span class="landing-hero-accent">{titleAccent}</span>{titleEnd}`
  'landing.hero.titleLead': '',
  'landing.hero.titleAccent': 'ひとりでに記録される',
  'landing.hero.titleEnd': '瞑想。',
  'landing.hero.tagline':
    '実践を記録し、連続日数を積み重ね、意図をもって呼吸する——すべてをひとつの場所で。MeditationOS は、もうひとつの音声ライブラリではなく、あなたの実践データを中心に作られています。1日数分で、習慣は根づいていきます。',
  'landing.hero.guestNote': '試すのに登録は不要です。',
  'landing.hero.breatheCaption': '吸って……吐いて。',

  // 共通の CTA（ヒーロー・末尾）
  'landing.cta.getStarted': '無料ではじめる',
  'landing.cta.login': 'ログイン',

  // ── 仕組み ──────────────────────────────────────────────────────────────────
  'landing.how.title': '仕組み',
  'landing.how.lead': '3 ステップ。記録はアプリが引き受けます。',
  'landing.step.sit.title': '数分だけ座る',
  'landing.step.sit.body':
    'タイマーを始める、呼吸のペーサーに合わせる、ろうそくを見つめる。試すのにアカウントも音声のダウンロードも不要です。',
  'landing.step.log.title': '自動で記録される',
  'landing.step.log.body':
    'セッション、呼吸、感謝のメモ、日記のすべてがひとつの場所に集まり、進むほどに連続日数が積み上がります。',
  'landing.step.watch.title': 'パターンが見えてくる',
  'landing.step.watch.body':
    'ダッシュボードが生の実践を連続日数・傾向・ヒートマップに変え、習慣が根づいていく様子が見えます。',

  // ── 主な機能 ────────────────────────────────────────────────────────────────
  'landing.features.title': '穏やかな場所に、すべてを',
  'landing.features.lead':
    '9 通りの実践と振り返り——そのどれもが、同じ澄んだ進捗の全体像へとつながります。',
  'landing.feature.timer.title': '瞑想タイマー',
  'landing.feature.timer.body':
    'ガイドなしの「今すぐ座る」セッション。穏やかなタイマー、開始・途中・終了の鐘（任意）、そしてバックグラウンドのタブでも狂わない計測。',
  'landing.feature.breathing.title': 'HRV レゾナンス呼吸',
  'landing.feature.breathing.body':
    '選んだゆったりしたペースのガイド付きペーサー。波の呼吸の音声ガイドと、たどるための呼吸サークル付き。',
  'landing.feature.gratitude.title': '感謝',
  'landing.feature.gratitude.body':
    '37 のテーマで、小さな感謝の瞬間を書き留める。AI が提案するプロンプトでも、自分の言葉でも。',
  'landing.feature.journal.title': '日記',
  'landing.feature.journal.body':
    '座った後に振り返り、気分をタグ付けし、過去のエントリーをランダムに呼び出して読み返す。',
  'landing.feature.trataka.title': 'ろうそく凝視',
  'landing.feature.trataka.body':
    '目を開けたまま行う集中の実践（伝統的にトラタクと呼ばれます）——ゆらめく一点の炎に注意を休め、ざわつく心を落ち着けます。',
  'landing.feature.goals.title': '目標',
  'landing.feature.goals.body':
    '瞑想・呼吸・日記などの習慣を設定すると、進捗はあなたの記録から自動で埋まっていきます。',
  'landing.feature.spirit.title': 'スピリット',
  'landing.feature.spirit.body':
    '実践を通じて育てる生きた相棒を目覚めさせる。瞑想の仕方に応じた道を進化し、続けるほどに成長します。',
  'landing.feature.dashboard.title': 'ダッシュボードと分析',
  'landing.feature.dashboard.body':
    '連続日数、レベル、週ごとの内訳、活動ヒートマップ、種類・曜日・時間帯ごとの傾向。',
  'landing.feature.xp.title': '連続日数・XP・ミッション',
  'landing.feature.xp.body':
    '日替わりのミッション、XP とレベル、そして 1 日休める寛容な連続日数——ぎすぎすせず、穏やかに。',

  // ── 信頼・プライバシー ──────────────────────────────────────────────────────
  'landing.trust.title': 'あなたの実践データは、あなたのもの',
  'landing.trust.lead':
    '設計からプライバシー優先。あなたの振り返りを売ることも、ダークパターンもありません——あるのは、あなたが完全に管理できる実践の記録だけ。',
  'landing.trust.export.title': 'いつでも書き出し',
  'landing.trust.export.body':
    '記録したすべてを、いつでも JSON でダウンロード。あなたのデータです——持ち出せます。',
  'landing.trust.delete.title': 'いつでも削除',
  'landing.trust.delete.body':
    '設定から、数クリックでアカウントとデータを完全に削除。「解約はサポートへ連絡」は不要です。',
  'landing.trust.yours.title': '既定であなたのもの',
  // /privacy へのインラインリンクの前後で分割します。
  'landing.trust.yours.bodyPre':
    'あなたのセッションと日記はアカウントに紐づき、共有されません。保存する内容は',
  'landing.trust.yours.link': 'プライバシーポリシー',
  'landing.trust.yours.bodyPost': 'でご確認いただけます。',
  'landing.trust.note':
    'なぜ 1 日数分なのか？ 小さく繰り返せる実践は、大きなものより続けやすく——続けることこそが目的だからです。MeditationOS は実践のトラッカーであり、治療ではなく、医療的な主張は一切しません。',

  // ── ストーリー・価値 ────────────────────────────────────────────────────────
  'landing.story.title': 'なぜ作ったのか',
  'landing.story.body':
    '瞑想を続けたかったのに、試したアプリはどれも音声トラックの壁ばかりで、習慣が本当に身についているかを見せてはくれませんでした。だから、欲しかった道具を自分で作りました——実践をデータに変え、続けたことを讃え、邪魔をしない。それが MeditationOS で、無料ではじめられます。',
  'landing.story.signoff': '— MeditationOS の作り手',
  'landing.value.heading': '得られるもの',
  'landing.value.1':
    '9 通りの実践——タイマー、レゾナンス呼吸、感謝、日記、ろうそく凝視、ほか',
  'landing.value.2':
    'すべてのセッションを連続日数・傾向・活動ヒートマップに変える、澄んだダッシュボード',
  'landing.value.3':
    '実践で育てる生きたスピリットの相棒、そして穏やかな XP・レベル・日替わりミッション',
  'landing.value.4':
    'データはあなたのもの——すべてを JSON で書き出すか、いつでもアカウントを削除',
  'landing.value.5':
    'ゲストとしてすぐに試せる——メール不要、カード不要、音声ライブラリを探し回る必要もなし',
  'landing.testimonials.lead':
    'MeditationOS で実践を続けていますか？ あなたの物語をここで紹介できたらうれしいです。',

  // ── 末尾の CTA ──────────────────────────────────────────────────────────────
  'landing.final.title': '今日、あなたの実践をはじめよう',
  'landing.final.lead':
    '無料ではじめられ、探し回る音声ライブラリもありません。あなたと、静かな数分と、ともに育っていく記録だけ。',
}
