// spirit domain (Japanese) — mirrors locales/en/spirit. Calm, polite (です/ます). Dosha
// descriptions read naturally rather than literally. Placeholders ({var}) are preserved.
// A key missing here falls back to English at lookup time.
export const spirit: Record<string, string> = {
  // ── SpiritPage ─────────────────────────────────────────────────────────────────────────────
  // Page head
  'spirit.page.title': 'あなたのスピリット',
  'spirit.page.subtitle': '練習を通して育てていく相棒です。',
  'spirit.loading': 'スピリットを目覚めさせています…',
  'spirit.error': 'スピリットに接続できませんでした。',

  // First-visit intro
  'spirit.intro.what': 'スピリットは練習とともに育ちます。セッションのひとつひとつが糧になります。',
  'spirit.intro.how':
    'その求めは穏やかで、決して罰するものではありません。どんな練習でも機嫌よく過ごせます。レベルが上がるとコインが手に入り、「カスタマイズ」で見た目に使えます。ゲームはそれだけです。',
  'spirit.intro.gotit': 'わかりました',

  // Tend actions
  'spirit.tend.feed': '食べさせる',
  'spirit.tend.rest': '休ませる',
  'spirit.tend.play': '遊ぶ',

  // Hero read-out
  'spirit.hero.pathSpirit': '{name}のスピリット',
  'spirit.hero.pathless': ' · まだ道のない灯',
  'spirit.hero.bond': '絆レベル {level}',
  'spirit.hero.coins': '使えるコイン',
  'spirit.hero.pathSuffix': 'のスピリット',

  // Tabs
  'spirit.tabs.care': 'ケア',
  'spirit.tabs.customize': 'カスタマイズ',
  'spirit.tabs.collection': 'コレクション',
  'spirit.tabs.aria': 'スピリットのセクション',

  // Set-bonus status (Signature radiance)
  'spirit.setbonus.activeNote':
    'すべての{total}個のシグネチャーを身につけているので、相棒は特別な輝きをまとっています。',
  'spirit.setbonus.radiance': 'シグネチャーの輝き',
  'spirit.setbonus.progress.explain1':
    'は、その{total}個すべての',
  'spirit.setbonus.progress.signaturePieces': 'シグネチャー',
  'spirit.setbonus.progress.explain2':
    'を身につけると得られる、やわらかく光る輝きです。シグネチャーは、その種類の相棒だけが身につけられる特別な装飾で、スロットごとに1つずつあります。',
  'spirit.setbonus.progress.count': '現在 {total}個のうち {count}個です。',
  'spirit.setbonus.previewing': '輝きをプレビュー中…',
  'spirit.setbonus.see': '輝きを見る',

  // Need tag / lock reasons
  'spirit.needTag.favours': '{label}に効きます',
  'spirit.lock.tier': 'まずティア{prev}のアイテムを解放してください',
  'spirit.lock.keepPracticing': '練習を続けると解放されます',

  // Capstone seal titles
  'spirit.capstone.radiant': '輝きの頂点',
  'spirit.capstone.signature': 'シグネチャーの頂点',

  // Slot summary / node controls
  'spirit.slot.noneYet': 'まだなし',
  'spirit.slot.showFewer': '表示を減らす',
  'spirit.slot.moreUnlock': '育つと解放されるアイテムがあと{count}個',
  'spirit.node.worn': '着用中',
  'spirit.node.remove': '外す',
  'spirit.node.removeAria': '{label}を外す',
  'spirit.node.equip': '着ける',
  'spirit.node.equipAria': '{label}を着ける',
  'spirit.node.unlock': '解放',
  'spirit.node.unlockAria': '{cost}コインで{label}を解放',
  'spirit.node.unlockUnaffordableAria': '{cost}コインで{label}を解放 — コインが足りません',
  'spirit.node.needMore': 'あと{count}コイン必要です',

  // Care section
  'spirit.care.title': 'ケア',
  'spirit.care.fallbackName': 'あなたのスピリット',
  'spirit.care.vitalityIs': 'は',
  'spirit.care.vitalityAny': 'です — どんな練習でもその状態を保てます。',
  // Care subtitle, split around the bolded facet words.
  'spirit.care.subtitle.p1':
    '以下は最近の練習のバランスです — やることリストではなく、練習の傾向をやさしく示すものです。座る瞑想は',
  'spirit.care.subtitle.p2': 'を、感謝とジャーナリングは',
  'spirit.care.subtitle.p3': 'を、相棒のお気に入りの練習は',
  'spirit.care.subtitle.p4': 'を満たします。好きなときにどれかを世話しても、ただ練習してもかまいません。',
  'spirit.tend.aria': 'スピリットの世話をする',
  'spirit.tend.btnAria': '{label} — {need}を補う',
  'spirit.tend.hint': '練習は求めを満たし、世話は少し補います。',

  // Customize section
  'spirit.customize.title': 'カスタマイズ',
  'spirit.customize.subtitle':
    '相棒の見た目を整えましょう。コインはレベルアップで手に入り(セッションごとにXPが増えます)、解放したアイテムはずっとあなたのもの。付け替えは無料です。',
  'spirit.customize.empty': '練習を続けましょう。スピリットが育つと飾りが解放されます。',
  'spirit.customize.slotsAria': 'カスタマイズのスロット',
  'spirit.customize.preview': 'プレビュー',

  // Collection section
  'spirit.collection.title': 'コレクション',
  'spirit.collection.subtitle': '輝きまで育てて旅立たせたスピリットたちです。',
  'spirit.collection.empty': '今はまだ空です。これまでの相棒がここで休みます。',
  'spirit.collection.retiredName': '{stage}のスピリット',

  // Reset name (foot of page)
  'spirit.resetName.line': '相棒の名前を{cost}コインでつけ直せます。',
  'spirit.resetName.button': '名前をつけ直す',
  'spirit.resetName.needsCoins': '{cost}コイン必要です',

  // Journey / growing
  'spirit.journey.aria': 'スピリットの育ち方',
  'spirit.journey.title': '輝きへと育つ',
  'spirit.journey.note.lead': '練習がスピリットを灯から',
  'spirit.journey.note.radiantWord': '輝き',
  'spirit.journey.note.tail': 'へと育てます。',
  'spirit.journey.note.radiantNow.lead': ' もう輝いています — 下で',
  'spirit.journey.note.radiantNow.setFree': '旅立たせる',
  'spirit.journey.note.radiantNow.tail': 'ことができます。',

  // Awaken section
  'spirit.awaken.aria': '新しい灯を目覚めさせる',
  'spirit.awaken.note':
    '輝いたスピリットの旅は完結しました。準備ができたら、新しい灯を目覚めさせて再び始めましょう。この子はコレクションに引退し、ずっと残ります。',
  'spirit.awaken.button': '新しい灯を目覚めさせる',

  // Awaken confirm modal
  'spirit.awaken.modal.aria': '新しい灯を目覚めさせる',
  'spirit.awaken.modal.title': '新しい灯を目覚めさせますか？',
  'spirit.awaken.modal.body':
    '輝いたスピリットはコレクションに引退してずっと残り、新しい道のない灯が始まります。これは取り消せません。',
  'spirit.awaken.modal.doing': '目覚めさせています…',
  'spirit.awaken.modal.keep': 'この子のままにする',

  // Unlock confirm modal
  'spirit.unlock.modal.aria': 'スピリットのために{label}を解放',
  'spirit.unlock.modal.title': '{label}を解放しますか？',
  'spirit.unlock.modal.body':
    '今の姿と、{slot}に{label}を着けた姿を見比べられます。解放するとずっとあなたのものになり、すぐに着用します。',
  'spirit.unlock.modal.now': '今',
  'spirit.unlock.modal.with': '{label}を着けた姿',
  'spirit.unlock.modal.doing': '解放しています…',
  'spirit.unlock.modal.confirm': '解放',
  'spirit.unlock.modal.cancel': 'キャンセル',

  // Reset-name modal
  'spirit.resetName.modal.aria': 'スピリットの名前をつけ直す',
  'spirit.resetName.modal.title': 'スピリットの名前をつけ直しますか？',
  'spirit.resetName.modal.body':
    '相棒の名前は選んだときに決まりました。変更には{cost}コインかかります。',
  'spirit.resetName.modal.newName': '新しい名前',
  'spirit.resetName.modal.placeholder': '新しい名前',
  'spirit.resetName.modal.doing': '変更しています…',
  'spirit.resetName.modal.confirm': '名前を変更({cost}コイン)',
  'spirit.resetName.modal.cancel': 'キャンセル',

  // Toasts
  'spirit.toast.unlocked': '{label}を解放しました — スピリットが喜んでいます',
  'spirit.toast.unlockFail': 'まだ解放できません — 練習でコインを貯めましょう。',
  'spirit.toast.equipOn': '{label}を着けました。',
  'spirit.toast.slotCleared': '{slot}を外しました。',
  'spirit.toast.equipFail': '今は変更できませんでした。',
  'spirit.toast.renamed': '名前を変えました。これからはその名で応えます。',
  'spirit.toast.renameFail': '名前を変更できませんでした — コインが足りないかもしれません。',
  'spirit.toast.awakened': '新しい灯が目覚めます。輝いたスピリットはコレクションに加わります。',
  'spirit.toast.awakenFail': 'スピリットはまだ輝いていません — 練習を続けましょう。',
  'spirit.toast.tended': '{label}を補いました — 練習で満たされます。',
  'spirit.toast.tendFail': '今は世話ができませんでした — もう一度お試しください。',

  // ── SpiritChoosePage ───────────────────────────────────────────────────────────────────────
  'spirit.choose.back': '← スピリット',
  'spirit.choose.hatch.title': '最初のひと呼吸を終えました — これから育てる相棒に出会いましょう。',
  'spirit.choose.hatch.suggested':
    'お聞きした内容から、{name}が合うかもしれません — でも心惹かれる子を選んでください。',
  'spirit.choose.hatch.any': '心惹かれる子を選んでください — 間違いはありません。',
  'spirit.choose.title': '相棒を選ぶ',
  'spirit.choose.subtitle':
    'どの子も、その性質を整える練習でいきいきします — あなたのリズムに合う子を選びましょう。',
  'spirit.choose.suggestedForYou': 'あなたへのおすすめ',
  'spirit.choose.favours': '得意な練習',
  'spirit.choose.tryonsAria': '{name}の見た目をランダムに試す',
  'spirit.choose.rollNew': '別の見た目にする',
  'spirit.choose.tryRandom': 'ランダムな見た目を試す',
  'spirit.choose.clear': 'クリア',
  'spirit.choose.choose': '{name}を選ぶ',
  'spirit.choose.chooseDifferent': '← 別の相棒を選ぶ',
  'spirit.choose.nameLabel': '{name}の相棒に名前をつける',
  'spirit.choose.namePlaceholder': '例: エンバー',
  'spirit.choose.nameHint': '名前は変わりません — あとで変えるとコインがかかるので、気に入った名前を選びましょう。',
  'spirit.choose.nameFirst': 'まず相棒に名前をつけてください',
  'spirit.choose.awakening': '目覚めさせています…',
  'spirit.choose.awaken': '{name}を目覚めさせる',

  // Choose-page toasts
  'spirit.choose.toast.awakens': '{name}のスピリットが目覚めます。{glyph}',
  'spirit.choose.toast.chooseFail': 'その相棒を選べませんでした — もう一度お試しください。',

  // About the doshas. The intro + note keep their inline emphasis in the JSX; only the plain-text
  // run around the markup is templated here.
  'spirit.dosha.about.summary': 'ドーシャについて',
  'spirit.dosha.about.intro.p1': 'アーユルヴェーダでは、三つの',
  'spirit.dosha.about.intro.doshas': 'ドーシャ',
  'spirit.dosha.about.intro.p2': 'は元素のエネルギーで、それぞれ',
  'spirit.dosha.about.intro.balance': 'バランス',
  'spirit.dosha.about.intro.p3': 'によって健やかに保たれます — 自分の性質の',
  'spirit.dosha.about.intro.opposite': '反対',
  'spirit.dosha.about.intro.p4': 'に寄ることで。だから各相棒は、自分を',
  'spirit.dosha.about.intro.counterbalances': '釣り合わせる',
  'spirit.dosha.about.intro.p5': '練習でいきいきします。',
  // The list line: "(<element>) — <vibe>" + "wants a <balance> practice → <practice>"
  'spirit.dosha.about.item.elementVibe': '({element}) — {vibe}',
  'spirit.dosha.about.item.wants': 'には',
  'spirit.dosha.about.item.practiceArrow': 'の練習が向いています → ',
  'spirit.dosha.about.item.end': '。',
  'spirit.dosha.about.note.p1':
    '深い伝統をやさしく簡略にしたもので、医療的な助言ではありません。(カパを活気づける呼吸には、「Breathe」ページの',
  'spirit.dosha.about.note.energizing': 'Energizing',
  'spirit.dosha.about.note.p2': 'パターンをお試しください。)',

  // ── Stage names ──────────────────────────────────────────────────────────────────────────────
  'spirit.stage.spark': '灯',
  'spirit.stage.wisp': 'ゆらめき',
  'spirit.stage.fledgling': '芽生え',
  'spirit.stage.ascendant': '昇り',
  'spirit.stage.radiant': '輝き',

  // ── Tier labels ──────────────────────────────────────────────────────────────────────────────
  'spirit.tier.thriving': '満ち足りている',
  'spirit.tier.content': '穏やか',
  'spirit.tier.restless': '落ち着かない',
  'spirit.tier.unwell': 'ケアが必要',

  // ── Dosha display copy (Kapha / Pitta / Vata) ────────────────────────────────────────────────
  'spirit.dosha.kapha.name': 'カパ',
  'spirit.dosha.kapha.element': '地 + 水',
  'spirit.dosha.kapha.vibe': '地に足がつき、穏やかで、安定した性質',
  'spirit.dosha.kapha.practice': '呼吸法',
  'spirit.dosha.kapha.balance': '活気づける',
  'spirit.dosha.kapha.why':
    '地と水のカパは重く、ゆったりしがちです — 呼吸法がエネルギーを巡らせ、いきいきと保ちます。',

  'spirit.dosha.pitta.name': 'ピッタ',
  'spirit.dosha.pitta.element': '火 + 水',
  'spirit.dosha.pitta.vibe': '鋭く、情熱的で、エネルギッシュな性質',
  'spirit.dosha.pitta.practice': '感謝とジャーナリング',
  'spirit.dosha.pitta.balance': '静める',
  'spirit.dosha.pitta.why':
    '火のピッタは熱く鋭く燃えます — 静かに振り返る感謝とジャーナリングが、燃え尽きないように和らげます。',

  'spirit.dosha.vata.name': 'ヴァータ',
  'spirit.dosha.vata.element': '風 + 空',
  'spirit.dosha.vata.vibe': '軽やかで、動きやすく、表情豊かな性質',
  'spirit.dosha.vata.practice': '瞑想',
  'spirit.dosha.vata.balance': '地に足をつける',
  'spirit.dosha.vata.why':
    '風のヴァータは軽く、散りやすいものです — 地に足をつける瞑想が落ち着かせ、安定させます。',
}
