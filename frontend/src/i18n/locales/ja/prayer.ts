// prayer domain——Japanese. Calm, polite register. Non-denominational (どの信仰にも、
// また信仰がなくても開かれた表現). {var} placeholders are preserved exactly. A missing key
// falls back to English at lookup time.
export const prayer: Record<string, string> = {
  'prayer.title': '祈りのジャーナル',
  'prayer.subtitle': '祈り・願い・祝福を書きとめ、あとで見返すための場所です。',
  // 保存後のXP内訳に出る行（RewardOverlay）
  'prayer.activityLabel': '祈りの記録',
  'prayer.composerAria': '祈り・願い・祝福',
  'prayer.composerPlaceholder': '祈り・願い・祝福を書いてみましょう…',
  'prayer.save': '保存',
  'prayer.saveError': '祈りを保存できませんでした。もう一度お試しください。',
  'prayer.pastTitle': 'あなたの祈り',
  'prayer.loadError': '祈りを読み込めませんでした。',
  'prayer.loadMore': 'もっと見る',
  'prayer.loadMoreError': 'これ以上読み込めませんでした。',
  // 空の状態（フィルターごと）
  'prayer.empty': 'まだ静かな場所です。最初の祈りが一番上に表示されます。',
  'prayer.emptyOpen': 'いま、かなえられていない祈りはありません。',
  'prayer.emptyAnswered': 'かなえられたと記した祈りはまだありません。',
  // フィルタータブ
  'prayer.filterAria': '祈りをフィルター',
  'prayer.filter.all': 'すべて',
  'prayer.filter.open': '未成就',
  'prayer.filter.answered': 'かなった',
  // 成就トグル・バッジ
  'prayer.markAnswered': 'かなったと記す',
  'prayer.reopen': '未成就に戻す',
  'prayer.answeredBadge': 'かなった',
  'prayer.answeredOn': '{date} にかなった',
  'prayer.answerError': 'この祈りを更新できませんでした。もう一度お試しください。',
  // 記録の操作（編集・削除は控えめなメニューの中）
  'prayer.entryActions': '祈りの操作',
  'prayer.edit': '編集',
  'prayer.delete': '削除',
  'prayer.editBodyAria': '祈りを編集',
  'prayer.editSave': '保存',
  'prayer.editCancel': 'キャンセル',
  'prayer.updated': '祈りを更新しました。',
  'prayer.updateError': '祈りを更新できませんでした。',
  'prayer.deleted': '祈りを削除しました。',
  'prayer.deleteError': '祈りを削除できませんでした。',
}
