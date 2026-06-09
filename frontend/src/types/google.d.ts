// Minimal typings for the Google Identity Services client (loaded via <script>
// in index.html). Only the surface we actually use.

interface GoogleCredentialResponse {
  credential: string
}

interface GoogleIdConfig {
  client_id: string
  callback: (response: GoogleCredentialResponse) => void
}

interface GoogleButtonOptions {
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'small' | 'medium' | 'large'
  width?: number
  text?: 'signin_with' | 'signup_with' | 'continue_with'
}

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfig) => void
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void
}

interface Window {
  google?: {
    accounts: {
      id: GoogleAccountsId
    }
  }
}
