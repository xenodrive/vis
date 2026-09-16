import type { ModelRef, OpenCodeClient } from '@opencode/client';

type SessionClient = Pick<
  OpenCodeClient['session'],
  'get' | 'active' | 'switchAgent' | 'switchModel'
>;
type Options = NonNullable<Parameters<SessionClient['get']>[1]>;
type Activity = { connection: number; started?: number; running: boolean };

export async function updateSessionSettings(
  input: { sessionID: string; agent?: string; model?: ModelRef },
  session: SessionClient,
  options: Options,
  activity: () => Activity,
) {
  const initial = activity();
  function checkConnection() {
    if (activity().connection !== initial.connection)
      throw new Error('The connection changed before updating session settings.');
  }
  async function requireIdle() {
    checkConnection();
    const before = activity();
    const active = await session.active(options);
    checkConnection();
    const after = activity();
    if (active[input.sessionID] || after.running)
      throw new Error('Wait for the session to stop before changing its agent or model.');
    if (before.started !== after.started)
      throw new Error('Session state changed while checking settings. Try again once it is idle.');
  }

  let info = await session.get({ sessionID: input.sessionID }, options);
  checkConnection();
  if (input.agent && input.agent !== info.agent) {
    await requireIdle();
    await session.switchAgent({ sessionID: input.sessionID, agent: input.agent }, options);
    checkConnection();
    info = { ...info, agent: input.agent };
  }
  const model = input.model;
  if (
    model &&
    (model.providerID !== info.model?.providerID ||
      model.id !== info.model?.id ||
      (model.variant ?? 'default') !== (info.model?.variant ?? 'default'))
  ) {
    await requireIdle();
    await session.switchModel({ sessionID: input.sessionID, model }, options);
    checkConnection();
    info = { ...info, model };
  }
  return info;
}
