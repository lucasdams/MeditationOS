// home domain (日本語)——HOME/ダッシュボードのまとまり。落ち着いた、あたたかい、ていねいな
// 表現（です・ます）。{var} プレースホルダーは英語版と同一に保つこと。
export const home: Record<string, string> = {
  // DashboardPage——タイトル
  'home.title': 'あなたのプラクティス',
  'home.error.stats': '記録を読み込めませんでした。',

  // 連続日数 / 休息日
  'home.streak.aria': '{count} 日連続',
  'home.restDay': '休息日を使いました。1 日お休みしても大丈夫です。',

  // Daily-goal ring
  'home.goal.label': '今日の目標',
  'home.goal.progress': '{done}／{goal} 分',
  'home.goal.met': '今日の目標を達成',
  'home.goal.adjust': '目標を調整',
  'home.goal.aria.progress': '今日は {goal} 分中 {done} 分プラクティスしました',
  'home.goal.aria.met': '今日の目標を達成しました——{goal} 分',

  // 今日のアクション（パス対応 + おすすめ）
  'home.today.pathDay': '{index} 日目 · {title}',
  'home.today.tryPath': 'ガイド付きパスを試す',

  // クイックアクセス
  'home.quickAccess.aria': 'クイックアクセス',

  // 今日のうながし（旧デイリークエスト）
  'home.quests.heading': '今日のうながし',
  'home.quests.aria.detail': '。{detail}',
  'home.quests.aria.progress': '——{progress} / {target}',
  'home.quests.aria.reward': '——ごほうび {xp} XP',
  'home.quests.aria.done': '——完了',
  'home.quests.detail.meditate': '呼吸法以外の瞑想、1 分以上',
  'home.quests.detail.long_sit': '10 分以上の瞑想を 1 回',
  'home.quests.detail.double_sit': '今日、別々の瞑想を 2 回',
  'home.quests.detail.breathe': 'どの呼吸法でも、1 分以上',
  'home.quests.detail.deep_breathe': '今日、合計 5 分以上の呼吸',
  'home.quests.detail.slow_breathe': '1 分あたり 5 呼吸以下のゆっくりした呼吸',
  'home.quests.detail.gratitude': '感謝のメモを 1 つ',
  'home.quests.detail.gratitude_three': '今日、感謝のメモを 3 つ',
  'home.quests.detail.journal': 'ジャーナルを 1 つ',
  'home.quests.detail.mood_journal': '気分をそえたジャーナルを 1 つ',

  // 気分の行
  'home.mood.reflect': '気分は「{mood}」でしたね ',
  'home.mood.log': '今日の気分を記録する',

  // まだ始めたばかりのとき（リンクの前後で分割）
  'home.empty.lead': 'まだ始めたばかりですね。',
  'home.empty.logSession': 'セッションを記録',
  'home.empty.or': ' または ',
  'home.empty.breathe': '呼吸',
  'home.empty.trailing': 'から始めてみましょう。',

  // 歩みタブ
  'home.progress.seeAnalytics': '詳しい分析を見る',

  // 気分モーダル
  'home.moodModal.aria': '今の気分はいかがですか？',
  'home.moodModal.kicker': 'ひと呼吸おきましょう',
  'home.moodModal.heading': '今の気分はいかがですか？',
  'home.moodModal.skip': '今はスキップ',

  // EncouragementNote——ハートのボタン + めぐる励ましのことば
  'home.encouragement.sendLove': 'そっと愛をおくる',
  'home.encouragement.0': '今日、ここに来られましたね。',
  'home.encouragement.1': '自分にやさしくしてください。',
  'home.encouragement.2': 'ひと呼吸ごとに、新しい始まりです。',
  'home.encouragement.3': '小さな一歩でも、前へ進んでいます。',
  'home.encouragement.4': '休むことも、プラクティスの一部です。',
  'home.encouragement.5': '少しのプラクティスが、大きな力になります。',
  'home.encouragement.6': '相棒は、ここにいます。',
  'home.encouragement.7': '始め方に、まちがいはありません。',
  'home.encouragement.8': '静かなひと呼吸も、りっぱな一歩です。',
  'home.encouragement.9': '今日がどんな日でも、ひと呼吸が助けになります。',
  'home.encouragement.10': '歩みは、いつも目立つとはかぎりません。',
  'home.encouragement.11': 'ここに来るのがいちばん大変で、あなたはそれをやりとげました。',
  'home.encouragement.12': 'どのセッションも、少しの静けさを残していきます。',
  'home.encouragement.13': 'ひと呼吸ずつ、習慣を育てています。',
  'home.encouragement.14': '続けていくうちに、習慣があなたを運んでくれます。',
  'home.encouragement.15': 'ひと座りごとに、静けさが少しずつ深まります。',

  // FirstRunCard
  'home.firstRun.aria': 'はじめの一歩',
  'home.firstRun.dismiss': 'はじめの一歩を閉じる',
  'home.firstRun.title': 'はじめてですか？　小さな一歩から始めましょう。',
  'home.firstRun.body':
    '数分だけ呼吸をするか、すでに終えたひと座りを記録してみましょう。プラクティスを重ねるほど、ダッシュボードが満ちていきます。',
  'home.firstRun.breathe': '呼吸する',
  'home.firstRun.logSession': 'セッションを記録',

  // GraduationCard
  'home.graduation.aria': '成長しましたね',
  'home.graduation.dismiss': '閉じる',
  'home.graduation.title': 'しっかりとしたプラクティスが育ちましたね',
  'home.graduation.body':
    '続けてこられました。いちばん大変なところです。準備ができたら、呼吸が HRV にどう働きかけるかを測ったり、これまでの記録をじっくり見たり、相棒をより深く見つめてみましょう。',
  'home.graduation.hrv': 'HRV を測る',
  'home.graduation.analytics': '詳しい分析',
  'home.graduation.customize': 'カスタマイズ',
  'home.graduation.gotIt': 'わかりました',

  // WeeklyReview
  'home.weekly.heading': '今週',
  'home.weekly.gathering': '今週の様子をまとめています…',
  'home.weekly.empty': '今週はまだプラクティスの記録がありません。数分の静かな時間から始めてみましょう。',
  'home.weekly.delta.same': '先週と同じ',
  'home.weekly.delta.up': '先週より ▲ {delta} 分',
  'home.weekly.delta.down': '先週より ▼ {delta} 分',
  'home.weekly.label.minutes': '分',
  'home.weekly.daysPracticed': '{days}/7',
  'home.weekly.label.daysPracticed': 'プラクティス日数',
  'home.weekly.label.dayStreak': '日連続',
  'home.weekly.minutesUnit': '{count} 分',
  'home.weekly.label.longestSit': '最長のひと座り',
  'home.weekly.label.mostly': 'おもに {mood}',

  // LevelCard
  'home.level.title': 'レベル {level}',
  'home.level.xpProgress': 'XP の進み',
  'home.level.xpText': 'レベル {next} まで {into} / {forNext} XP · 合計 {total}',

  // MoodCheckin
  'home.moodCheckin.heading': '今の気分はいかがですか？',
  'home.moodCheckin.group': '気分を記録',
  'home.moodCheckin.noted': '記録しました。',
  'home.moodCheckin.error': '気分を記録できませんでした。もう一度お試しください。',
  'home.moodCheckin.thanks': 'チェックインありがとうございます。あなたの傾向に反映されます。',

  // DailyReading——UI ラベルのみ（本文の一節はコンテンツなのでそのまま）
  'home.reading.aria': '今日の一節',
  'home.reading.eyebrow': '今日の一節',
  'home.reading.cite': '— {attribution}',
  'home.reading.reflect': 'これについて振り返る',

  // 日替わりのあいさつ（ダッシュボードのタイトル下・lib/zen.ts が日ごとに選ぶ）
  'home.greeting.0': 'ナマステ',
  'home.greeting.1': 'おかえりなさい。ひと呼吸、ゆったりと',
  'home.greeting.2': '座布団が待っていましたよ',
  'home.greeting.3': 'ひと呼吸ずつ',
  'home.greeting.4': '「いま」が、そっとここにあります',
  'home.greeting.5': 'いま、ここに',
  'home.greeting.6': '静けさを吸って、あわただしさを吐いて',
  'home.greeting.7': 'やわらかな心、静かな鼓動',
  'home.greeting.8': '少しの静けさが、大きな助けになります',
  'home.greeting.9': 'どこへ行っても、そこにあなたがいます',
  'home.greeting.10': '今日ここに来ることで、少しずつ変わっていきます',
  'home.greeting.11': 'ひと呼吸ずつ、習慣を育てましょう',

  // 「読み込み中…」のかわりの、マインドフルなひとこと（lib/zen.ts）
  'home.loading.0': '中心を見つけています…',
  'home.loading.1': '吸って…吐いて…',
  'home.loading.2': '静けさを集めています…',
  'home.loading.3': '心を落ち着けています…',
  'home.loading.4': '呼吸に戻ります…',
  'home.loading.5': 'マインドフルなひととき…',

  // おすすめプラクティス（lib/recommendation.ts）— ボタンの誘い + 一言の理由
  'home.recommend.morning.cta': '集中の瞑想で、すっきり始める',
  'home.recommend.morning.blurb': '一日の穏やかな始まりに。',
  'home.recommend.afternoon.cta': 'ゆっくり、ひと呼吸おく',
  'home.recommend.afternoon.blurb': '日中の小さなリセットに。',
  'home.recommend.evening.cta': 'ヨガニドラでクールダウン',
  'home.recommend.evening.blurb': '夜のための、深い休息を。',
  'home.recommend.night.cta': 'ヨガニドラで、眠りへ',
  'home.recommend.night.blurb': '一日をやさしく締めくくりましょう。',
  'home.recommend.joyful.cta': '慈しみの瞑想で心を温める',
  'home.recommend.joyful.blurb': 'もう少しの喜びで、バランスが整います。',
  'home.recommend.rested.cta': 'ボディスキャンで落ち着く',
  'home.recommend.rested.blurb': 'もう少しの休息で、バランスが整います。',
  'home.recommend.nourished.cta': '集中の瞑想で自分を整える',
  'home.recommend.nourished.blurb': '地に足をつけるプラクティスで、バランスを。',
  // 初心者向けのおすすめ（レベル3以下）——時間帯ごとの、いちばんやさしい入り口。
  'home.recommend.beginner.morning.cta': '3回のマインドフルな呼吸から',
  'home.recommend.beginner.morning.blurb': 'いちばんシンプルな始め方。',
  'home.recommend.beginner.afternoon.cta': 'ひと呼吸、ゆっくりと',
  'home.recommend.beginner.afternoon.blurb': '日中のちいさなリセット。',
  'home.recommend.beginner.evening.cta': 'やさしいボディスキャンで整える',
  'home.recommend.beginner.evening.blurb': 'かんたんにほぐす方法。',
  'home.recommend.beginner.night.cta': 'ボディスキャンでやわらかく',
  'home.recommend.beginner.night.blurb': '一日をそっと手放して。',
}
