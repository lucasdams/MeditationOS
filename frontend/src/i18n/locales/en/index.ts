// English catalog — merged from per-domain files. Each migrated page/cluster owns its own domain
// module (no shared-file merge conflicts when several migrations land in parallel). English is the
// SOURCE OF TRUTH: every value must stay byte-identical to the literal it replaced.
import { common } from './common'
import { auth } from './auth'
import { home } from './home'
import { practice } from './practice'
import { tracking } from './tracking'
import { spirit } from './spirit'
import { settings } from './settings'
import { paths } from './paths'

export const EN: Record<string, string> = {
  ...common,
  ...auth,
  ...home,
  ...practice,
  ...tracking,
  ...spirit,
  ...settings,
  ...paths,
}
