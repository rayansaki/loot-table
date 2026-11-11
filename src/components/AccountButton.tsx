import { syncAccount } from "../sync";
import "./AccountButton.css";

/** Whose list this is, and a way to switch: only when synced through your own server (sync.ts) */
export default function AccountButton() {
  const account = syncAccount();
  if (!account) return null;
  return (
    <a className="account" href="login" title="Switch to the other person's list">
      <span className="account-name">{account}</span>
      <span className="account-change">Change account</span>
    </a>
  );
}
