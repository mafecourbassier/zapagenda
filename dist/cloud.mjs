import { createClient } from './assets/supabase.mjs';
import { supabaseUrl, supabasePublishableKey } from './cloud-config.mjs';

const client = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { storageKey: 'zapagenda:cloud-session', detectSessionInUrl: true },
});

export const agendaConnection = {
  async initialize(onSession) {
    client.auth.onAuthStateChange((_event, session) => {
      // Consultas ao banco acontecem depois de o SDK liberar sua sessão de autenticação.
      setTimeout(() => onSession(session), 0);
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  },
  async signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },
  async signUp(email, password) {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    return data.session;
  },
  async signOut() {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  },
  async snapshot(slug) {
    const [{ data, error }, notifications] = await Promise.all([
      client.rpc('za_snapshot', { p_slug: slug }),
      client.rpc('za_whatsapp_state', { p_slug: slug }),
    ]);
    if (error) throw error;
    data.notifications = notifications.error ? null : notifications.data;
    return data;
  },
  async setWhatsAppPreferences(slug, phone, enabled) {
    const { error } = await client.rpc('za_set_whatsapp_preferences', {
      p_slug: slug, p_phone: phone, p_enabled: enabled,
    });
    if (error) throw error;
  },
  async command(slug, action, payload) {
    if (action === 'whatsapp-preferences') {
      return this.setWhatsAppPreferences(slug, payload.phone, payload.enabled);
    }
    if (action === 'history') {
      const { data, error } = await client.rpc('za_manage_history', {
        p_slug: slug, p_restore: payload.restore,
      });
      if (error) throw error;
      return data;
    }
    const { data, error } = await client.rpc('za_command', {
      p_slug: slug, p_action: action, p_payload: payload,
    });
    if (error) throw error;
    return data;
  },
  watch(slug, spaceId, onChange, onStatus) {
    const channel = client.channel(`agenda-${slug}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'za_space_events', filter: `space_id=eq.${spaceId}`,
      }, onChange)
      .subscribe(onStatus);
    return () => { void client.removeChannel(channel); };
  },
};

export function connectionError(error) {
  const code = error?.code;
  if (code === 'invalid_credentials') return 'Confira o e-mail e a senha da sua conta do ZapAgenda.';
  if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.';
  if (code === 'over_email_send_rate_limit') return 'O limite de envio de e-mails foi atingido. Tente novamente mais tarde.';
  if (code === 'user_already_exists') return 'Esse e-mail já está cadastrado. Entre na sua conta.';
  if (code === 'PGRST202') return 'A agenda deste espaço ainda está sendo preparada. Tente novamente em instantes.';
  if (code === '23P01') return 'Esse horário acabou de ser ocupado. Escolha outra opção.';
  if (code === '22023' || code === '42501') return error.message;
  if (code === 'weak_password') return 'Escolha uma senha mais forte para continuar.';
  return 'Não foi possível conectar à agenda. Confira sua conexão e tente novamente.';
}
