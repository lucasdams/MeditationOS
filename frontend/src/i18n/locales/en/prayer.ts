// prayer domain — the Prayer journal page (write prayers, intentions, or blessings;
// revisit them; mark as answered). Keys: 'prayer.*'. Non-denominational, inclusive of
// any faith or none. English is the SOURCE OF TRUTH.
export const prayer: Record<string, string> = {
  'prayer.title': 'Prayer journal',
  'prayer.subtitle':
    'A space for prayers, intentions, and blessings — write them down and return to them.',
  // The activity line in the post-save XP breakdown (RewardOverlay)
  'prayer.activityLabel': 'Prayer',
  'prayer.composerAria': 'Prayer, intention, or blessing',
  'prayer.composerPlaceholder': 'Write a prayer, intention, or blessing…',
  'prayer.save': 'Save',
  'prayer.saveError': "Couldn't save your prayer. Please try again.",
  'prayer.pastTitle': 'Your prayers',
  'prayer.loadError': "Couldn't load your prayers.",
  'prayer.loadMore': 'Load more',
  'prayer.loadMoreError': "Couldn't load more prayers.",
  // Empty states, per filter
  'prayer.empty': 'A quiet space, for now. Your first prayer goes up top.',
  'prayer.emptyOpen': 'No open prayers right now.',
  'prayer.emptyAnswered': 'No prayers marked answered yet.',
  // Filter tabs
  'prayer.filterAria': 'Filter prayers',
  'prayer.filter.all': 'All',
  'prayer.filter.open': 'Open',
  'prayer.filter.answered': 'Answered',
  // Answered toggle + badge
  'prayer.markAnswered': 'Mark as answered',
  'prayer.reopen': 'Reopen',
  'prayer.answeredBadge': 'Answered',
  'prayer.answeredOn': 'Answered {date}',
  'prayer.answerError': "Couldn't update this prayer. Please try again.",
  // Entry actions (edit / delete behind a quiet menu)
  'prayer.entryActions': 'Prayer actions',
  'prayer.edit': 'Edit',
  'prayer.delete': 'Delete',
  'prayer.editBodyAria': 'Edit prayer',
  'prayer.editSave': 'Save',
  'prayer.editCancel': 'Cancel',
  'prayer.updated': 'Prayer updated.',
  'prayer.updateError': "Couldn't update your prayer.",
  'prayer.deleted': 'Prayer deleted.',
  'prayer.deleteError': "Couldn't delete your prayer.",
}
