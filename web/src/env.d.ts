// Build-time settings (Vite): VITE_CHAT_URL = the chat Worker's address (public; set in the GitHub Actions build).
interface ImportMetaEnv {
  readonly VITE_CHAT_URL?: string;
}
