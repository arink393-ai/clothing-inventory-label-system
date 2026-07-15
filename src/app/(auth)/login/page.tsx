import { login } from "./actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  return <main className="login-page"><section className="login-card"><div className="brand login-brand"><span className="brand-mark">幸</span><div><strong>幸せ服飾・智慧進銷存</strong><small>SHIAWASE ERP</small></div></div><div className="internal-badge">門市內部應用程式</div><h1>登入門市系統</h1><p>請使用店主為您建立的員工帳號</p>{message && <div className="notice" role="status">{message}</div>}<form action={login}><div className="field"><label htmlFor="email">員工電子郵件</label><input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="name@shop.com" required/></div><div className="field"><label htmlFor="password">密碼</label><input id="password" name="password" type="password" autoComplete="current-password" placeholder="至少 8 個字元" minLength={8} required/></div><button className="btn primary">安全登入</button></form><div className="notice">本系統不開放自行註冊。需要帳號或忘記密碼時，請洽店主處理。</div></section></main>;
}
