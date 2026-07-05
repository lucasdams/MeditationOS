// spirit domain — the Spirit page + the creature-choose page (+ the dosha / stage / tier labels
// those pages render from Spirit.tsx's data maps, localized at the call site). Keys: 'spirit.*'.
// English is the SOURCE OF TRUTH: every value stays byte-identical to the literal it replaced.
export const spirit: Record<string, string> = {
  // ── SpiritPage ─────────────────────────────────────────────────────────────────────────────
  // Page head
  'spirit.page.title': 'Your spirit',
  'spirit.page.subtitle': 'A companion you grow through practice.',
  'spirit.loading': 'Waking your spirit…',
  'spirit.error': "Couldn't reach your spirit.",

  // First-visit intro
  'spirit.intro.what': 'Your spirit grows with your practice — every session feeds it.',
  'spirit.intro.how':
    'Its needs are gentle and never punishing: any practice keeps it content. Levelling up earns coins you can spend on its look in Customize. That’s the whole game.',
  'spirit.intro.gotit': 'Got it',

  // Tend actions
  'spirit.tend.feed': 'Feed',
  'spirit.tend.rest': 'Rest',
  'spirit.tend.play': 'Play',

  // Hero read-out
  'spirit.hero.pathSpirit': '{name} spirit',
  'spirit.hero.pathless': ' · a pathless spark',
  'spirit.hero.bond': 'Bond level {level}',
  'spirit.hero.coins': 'coins to spend',
  'spirit.hero.pathSuffix': 'spirit',

  // Tabs
  'spirit.tabs.care': 'Care',
  'spirit.tabs.customize': 'Customize',
  'spirit.tabs.collection': 'Collection',
  'spirit.tabs.aria': 'Spirit sections',

  // Set-bonus status (Signature radiance)
  'spirit.setbonus.activeNote':
    'Your companion shimmers with a special glow for wearing all {total} of its signature pieces.',
  'spirit.setbonus.radiance': 'Signature radiance',
  'spirit.setbonus.progress.explain1':
    ' is a gentle glowing shimmer your companion earns once you equip all {total} of its ',
  'spirit.setbonus.progress.signaturePieces': 'signature pieces',
  'spirit.setbonus.progress.explain2':
    ' — the special cosmetics only your kind of creature can wear, one per slot.',
  'spirit.setbonus.progress.count': 'You have {count} of {total} so far.',
  'spirit.setbonus.previewing': 'Previewing the radiance…',
  'spirit.setbonus.see': 'See the radiance',

  // Need tag / lock reasons
  'spirit.needTag.favours': 'Favours {label}',
  'spirit.lock.tier': 'Unlock a tier-{prev} option first',
  'spirit.lock.keepPracticing': 'Keep practicing to unlock this',

  // Capstone seal titles
  'spirit.capstone.radiant': 'Radiant capstone',
  'spirit.capstone.signature': 'Signature capstone',

  // Slot summary / node controls
  'spirit.slot.noneYet': 'none yet',
  'spirit.slot.showFewer': 'Show fewer',
  'spirit.slot.moreUnlock': '+ {count} more unlock as you grow',
  'spirit.node.worn': 'Worn',
  'spirit.node.remove': 'Remove',
  'spirit.node.removeAria': 'Remove {label}',
  'spirit.node.equip': 'Equip',
  'spirit.node.equipAria': 'Equip {label}',
  'spirit.node.unlock': 'Unlock',
  'spirit.node.unlockAria': 'Unlock {label} for {cost} coins',
  'spirit.node.unlockUnaffordableAria': 'Unlock {label} for {cost} coins — need more coins',
  'spirit.node.needMore': 'need {count} more coins',

  // Care section
  'spirit.care.title': 'Care',
  'spirit.care.fallbackName': 'Your spirit',
  'spirit.care.vitalityIs': ' is ',
  'spirit.care.vitalityAny': ' — any practice keeps them so.',
  // Care subtitle, split around the bolded facet words (Rest / Joy / Nourishment).
  'spirit.care.subtitle.p1':
    'Below is your recent practice balance — a gentle read of your mix, never a to-do. Sits fill ',
  'spirit.care.subtitle.p2': ', gratitude & journaling fill ',
  'spirit.care.subtitle.p3': ', and your creature’s own favourite practice fills ',
  'spirit.care.subtitle.p4': '. Tend a facet whenever you like, or just practice.',
  'spirit.tend.aria': 'Tend your spirit',
  'spirit.tend.btnAria': '{label} — top up {need}',
  'spirit.tend.hint': 'Practice fills a need fully; tending tops it up.',

  // Customize section
  'spirit.customize.title': 'Customize',
  'spirit.customize.subtitle':
    'Give your companion a look. Coins come from levelling up — every session adds XP — and unlocked pieces are yours forever; swapping them is free.',
  'spirit.customize.empty': 'Keep practicing — adornments unlock as your spirit grows.',
  'spirit.customize.slotsAria': 'Customization slots',
  'spirit.customize.preview': 'Preview',

  // Collection section
  'spirit.collection.title': 'Collection',
  'spirit.collection.subtitle': 'Spirits you grew to radiance and set free.',
  'spirit.collection.empty': 'Empty for now — past companions rest here.',
  'spirit.collection.retiredName': '{stage} spirit',

  // Reset name (foot of page)
  'spirit.resetName.line': "Reset your companion's name for {cost} coins.",
  'spirit.resetName.button': 'Reset name',
  'spirit.resetName.needsCoins': 'Needs {cost} coins',

  // Journey / growing
  'spirit.journey.aria': 'How your spirit grows',
  'spirit.journey.title': 'Growing to radiance',
  'spirit.journey.note.lead': 'Practice grows your spirit from spark to ',
  'spirit.journey.note.radiantWord': 'radiant',
  'spirit.journey.note.tail': '.',
  'spirit.journey.note.radiantNow.lead': ' Radiant now — you can ',
  'spirit.journey.note.radiantNow.setFree': 'set it free',
  'spirit.journey.note.radiantNow.tail': ' below.',

  // Awaken section
  'spirit.awaken.aria': 'Awaken a new spark',
  'spirit.awaken.note':
    'Your radiant spirit’s journey is complete. When you’re ready, awaken a new spark and begin again — this one retires into your collection, kept forever.',
  'spirit.awaken.button': 'Awaken a new spark',

  // Awaken confirm modal
  'spirit.awaken.modal.aria': 'Awaken a new spark',
  'spirit.awaken.modal.title': 'Awaken a new spark?',
  'spirit.awaken.modal.body':
    'Your radiant spirit will retire into your collection, kept forever, and a fresh pathless spark begins. This can’t be undone.',
  'spirit.awaken.modal.doing': 'Awakening…',
  'spirit.awaken.modal.keep': 'Keep this one',

  // Unlock confirm modal
  'spirit.unlock.modal.aria': 'Unlock {label} for your spirit',
  'spirit.unlock.modal.title': 'Unlock {label}?',
  'spirit.unlock.modal.body':
    'See how your spirit looks now and with {slot} {label} equipped. Unlocking owns it forever and equips it now.',
  'spirit.unlock.modal.now': 'Now',
  'spirit.unlock.modal.with': 'With {label}',
  'spirit.unlock.modal.doing': 'Unlocking…',
  'spirit.unlock.modal.confirm': 'Unlock',
  'spirit.unlock.modal.cancel': 'Cancel',

  // Reset-name modal
  'spirit.resetName.modal.aria': "Reset your spirit's name",
  'spirit.resetName.modal.title': "Reset your spirit's name?",
  'spirit.resetName.modal.body':
    "Your companion's name was set when you chose it. Changing it costs {cost} coins.",
  'spirit.resetName.modal.newName': 'New name',
  'spirit.resetName.modal.placeholder': 'A new name',
  'spirit.resetName.modal.doing': 'Changing…',
  'spirit.resetName.modal.confirm': 'Change name ({cost} coins)',
  'spirit.resetName.modal.cancel': 'Cancel',

  // Toasts
  'spirit.toast.unlocked': '{label} unlocked — your spirit is delighted',
  'spirit.toast.unlockFail': 'Not unlocked yet — practice earns the coins for it.',
  'spirit.toast.equipOn': '{label} on.',
  'spirit.toast.slotCleared': '{slot} set aside.',
  'spirit.toast.equipFail': "Couldn't change that right now.",
  'spirit.toast.renamed': 'Renamed. It answers to that now.',
  'spirit.toast.renameFail': "Couldn't change the name — you may need more coins.",
  'spirit.toast.awakened': 'A new spark awakens. Your radiant spirit joins your collection.',
  'spirit.toast.awakenFail': 'Your spirit is not radiant yet — keep practicing.',
  'spirit.toast.tended': '{label} topped up — practice fills it fully.',
  'spirit.toast.tendFail': "Couldn't tend it just now — try once more.",

  // ── SpiritChoosePage ───────────────────────────────────────────────────────────────────────
  'spirit.choose.back': '← Spirit',
  'spirit.choose.hatch.title': 'You took your first breath — now meet the companion you’ll grow.',
  'spirit.choose.hatch.suggested':
    'Based on what you told us, {name} might suit you — but choose whichever calls to you.',
  'spirit.choose.hatch.any': 'Pick whichever calls to you — there’s no wrong choice.',
  'spirit.choose.title': 'Choose your creature',
  'spirit.choose.subtitle':
    'Each creature thrives on the practice that balances its nature — pick the one whose rhythm fits yours.',
  'spirit.choose.suggestedForYou': 'Suggested for you',
  'spirit.choose.favours': 'Favours',
  'spirit.choose.tryonsAria': 'Try a random look for {name}',
  'spirit.choose.rollNew': 'Roll a new look',
  'spirit.choose.tryRandom': 'Try a random look',
  'spirit.choose.clear': 'Clear',
  'spirit.choose.choose': 'Choose {name}',
  'spirit.choose.chooseDifferent': '← Choose a different creature',
  'spirit.choose.nameLabel': 'Name your {name} companion',
  'spirit.choose.namePlaceholder': 'e.g. Ember',
  'spirit.choose.nameHint': 'Names stick — changing one later costs coins, so pick one you love.',
  'spirit.choose.nameFirst': 'Name your companion first',
  'spirit.choose.awakening': 'Awakening…',
  'spirit.choose.awaken': 'Awaken {name}',

  // Choose-page toasts
  'spirit.choose.toast.awakens': 'Your {name} spirit awakens. {glyph}',
  'spirit.choose.toast.chooseFail': "Couldn't choose that creature — please try again.",

  // About the doshas. The intro + note keep their inline <em>/<strong> emphasis in the JSX; only
  // the plain-text run around the markup is templated here (English frozen; markup unchanged).
  'spirit.dosha.about.summary': 'About the doshas',
  'spirit.dosha.about.intro.p1': 'In Ayurveda, the three ',
  'spirit.dosha.about.intro.doshas': 'doshas',
  'spirit.dosha.about.intro.p2': ' are elemental energies, each kept healthy through ',
  'spirit.dosha.about.intro.balance': 'balance',
  'spirit.dosha.about.intro.p3': ' — by leaning into the ',
  'spirit.dosha.about.intro.opposite': 'opposite',
  'spirit.dosha.about.intro.p4': ' of its nature. So each companion thrives on the practice that ',
  'spirit.dosha.about.intro.counterbalances': 'counterbalances',
  'spirit.dosha.about.intro.p5': ' it:',
  // The list line: "(<element>) — <vibe>" + "wants a <balance> practice → <practice>."
  'spirit.dosha.about.item.elementVibe': '({element}) — {vibe}',
  'spirit.dosha.about.item.wants': ' wants a ',
  'spirit.dosha.about.item.practiceArrow': ' practice → ',
  'spirit.dosha.about.item.end': '.',
  'spirit.dosha.about.note.p1':
    'A gentle, simplified take on a deep tradition — not medical advice. (For Kapha’s invigorating breath, try the ',
  'spirit.dosha.about.note.energizing': 'Energizing',
  'spirit.dosha.about.note.p2': ' pattern on the Breathe page.)',

  // ── Stage names (rendered at the page call site; art labels in Spirit.tsx stay English) ──────
  'spirit.stage.spark': 'Spark',
  'spirit.stage.wisp': 'Wisp',
  'spirit.stage.fledgling': 'Fledgling',
  'spirit.stage.ascendant': 'Ascendant',
  'spirit.stage.radiant': 'Radiant',

  // ── Tier labels (Care vitality line) ─────────────────────────────────────────────────────────
  'spirit.tier.thriving': 'Thriving',
  'spirit.tier.content': 'Content',
  'spirit.tier.restless': 'Restless',
  'spirit.tier.unwell': 'Needs care',

  // ── Dosha display copy (Kapha / Pitta / Vata) — rendered on the pages ────────────────────────
  'spirit.dosha.kapha.name': 'Kapha',
  'spirit.dosha.kapha.element': 'Earth + Water',
  'spirit.dosha.kapha.vibe': 'Grounded, calm, and steady.',
  'spirit.dosha.kapha.practice': 'breathwork',
  'spirit.dosha.kapha.balance': 'energizing',
  'spirit.dosha.kapha.why':
    'Earth-and-water Kapha can grow heavy and sluggish — breathwork gets its energy moving and keeps it bright.',

  'spirit.dosha.pitta.name': 'Pitta',
  'spirit.dosha.pitta.element': 'Fire + Water',
  'spirit.dosha.pitta.vibe': 'Sharp, intense, and energetic.',
  'spirit.dosha.pitta.practice': 'gratitude & journaling',
  'spirit.dosha.pitta.balance': 'cooling',
  'spirit.dosha.pitta.why':
    'Fiery Pitta runs hot and sharp — cooling, reflective gratitude & journaling soothes it so it doesn’t burn out.',

  'spirit.dosha.vata.name': 'Vata',
  'spirit.dosha.vata.element': 'Air + Ether',
  'spirit.dosha.vata.vibe': 'Light, mobile, and expressive.',
  'spirit.dosha.vata.practice': 'meditation',
  'spirit.dosha.vata.balance': 'grounding',
  'spirit.dosha.vata.why':
    'Airy Vata is light and easily scattered — grounding meditation settles and steadies it.',
}
