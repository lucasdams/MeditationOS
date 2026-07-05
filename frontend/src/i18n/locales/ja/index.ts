// Japanese catalog — merged from per-domain files, mirroring locales/en. A key missing here falls
// back to English at lookup time, so partial coverage always degrades gracefully.
import { common } from './common'
import { auth } from './auth'
import { home } from './home'
import { practice } from './practice'
import { tracking } from './tracking'
import { spirit } from './spirit'
import { settings } from './settings'
import { paths } from './paths'

export const JA: Record<string, string> = {
  ...common,
  ...auth,
  ...home,
  ...practice,
  ...tracking,
  ...spirit,
  ...settings,
  ...paths,
}
