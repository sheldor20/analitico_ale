'use client';
import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole, ArrowRight, LoaderCircle } from 'lucide-react';
import styles from './login-form.module.css';
export default function LoginForm({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !configured) return;
    setBusy(true); setError('');
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.get('email'), password: values.get('password') }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        setError(response.status === 429 ? 'Muitas tentativas. Aguarde um minuto e tente novamente.' : 'Não foi possível entrar. Confira suas credenciais ou procure o administrador.');
        return;
      }
      form.reset(); window.location.replace('/');
    } catch { setError('Não foi possível conectar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <section className={styles.intro} aria-label="Gestão Comercial Sicoob">
      <img className={styles.logo} src="/brand/sicoob-logo-light.svg" alt="Sicoob" width="174" height="50" />
      <div><p className={styles.eyebrow}>BAHIA & NORDESTE</p><h1>Sua carteira.<br /> Mais resultados.</h1><p className={styles.summary}>Metas e resultados das centrais Bahia e Nordeste.</p></div>
      <p className={styles.foot}>BAHIA · NORDESTE</p>
    </section>
    <section className={styles.panel} aria-labelledby="login-title">
      <div className={styles.card}><div className={styles.icon}><LockKeyhole size={25} aria-hidden="true" /></div>
        <p className={styles.eyebrow}>ACESSO À CARTEIRA</p><h2 id="login-title">Entre na sua conta</h2>
        <p className={styles.hint}>Use o e-mail e a senha cadastrados pelo administrador.</p>
        <form onSubmit={submit} aria-label="Entrar na conta" className={styles.form}>
          <label htmlFor="login-email">E-mail</label><input id="login-email" name="email" type="email" autoComplete="username" required maxLength={254} autoCapitalize="none" spellCheck={false} disabled={busy || !configured} placeholder="seu.email@exemplo.com" />
          <label htmlFor="login-password">Senha</label><div className={styles.password}><input id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} disabled={busy || !configured} /><button type="button" className={styles.reveal} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
          {(!configured || error) && <p role="alert" className={styles.error}>{!configured ? 'Acesso temporariamente indisponível. Procure o administrador.' : error}</p>}
          <button className={styles.submit} type="submit" disabled={busy || !configured}>{busy ? <><LoaderCircle size={19} /> Entrando…</> : <>Entrar <ArrowRight size={19} /></>}</button>
        </form><p className={styles.private}>Acesso exclusivo para contas autorizadas.</p>
      </div>
    </section>
  </main>;
}
