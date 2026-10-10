import { useEffect, useRef, useState } from 'react';

import {
  organizationsControllerList,
  organizationsControllerSetActive,
} from '@repo/client/api-client';
import { authClient } from '@/lib/auth-client';

type DemoAccount = {
  email: string;
  // 비우면 내 조직 목록의 첫 번째를 고른다.
  organizationSlug: string | null;
  password: string;
};

// 데모 배포에서만 켠다. 켜면 로그인하지 않은 방문자를 데모 계정으로 바로 로그인시킨다.
function readDemoAccount(): DemoAccount | null {
  const mode = process.env.EXPO_PUBLIC_DEMO_MODE ?? 'false';
  if (mode !== 'true' && mode !== 'false') {
    throw new Error('EXPO_PUBLIC_DEMO_MODE는 true 또는 false여야 합니다.');
  }
  if (mode === 'false') return null;

  const email = process.env.EXPO_PUBLIC_DEMO_EMAIL;
  const password = process.env.EXPO_PUBLIC_DEMO_PASSWORD;
  if (!email || !password) {
    throw new Error(
      '데모 모드에는 EXPO_PUBLIC_DEMO_EMAIL과 EXPO_PUBLIC_DEMO_PASSWORD가 필요합니다.',
    );
  }
  return {
    email,
    password,
    organizationSlug: process.env.EXPO_PUBLIC_DEMO_ORGANIZATION_SLUG || null,
  };
}

const demoAccount = readDemoAccount();

// 새로 로그인하면 고른 조직이 없는 상태다. 방문자가 바로 데이터를 보도록 조직을 골라 둔다.
async function activateDemoOrganization(account: DemoAccount): Promise<void> {
  const organizations = (await organizationsControllerList()).items;
  const organization = account.organizationSlug
    ? organizations.find((item) => item.slug === account.organizationSlug)
    : organizations[0];
  if (!organization) return;
  await organizationsControllerSetActive({ organizationId: organization.id });
}

// 로그인 요청이 겹치지 않게 진행 중인 요청 하나를 같이 기다린다.
let pendingSignIn: Promise<boolean> | null = null;

function signInDemoAccount(account: DemoAccount): Promise<boolean> {
  // signIn.email은 끝나자마자 session을 다시 읽게 해서 조직을 고르기 전에 화면이 뜬다.
  // 그래서 같은 로그인 API를 직접 부르고, 조직까지 고른 뒤에 session을 다시 읽는다.
  pendingSignIn ??= authClient
    .$fetch('/sign-in/email', {
      method: 'POST',
      body: { email: account.email, password: account.password },
    })
    .then(async (result) => {
      if (result.error) return false;
      // 조직을 고르지 못해도 로그인은 된 것이므로 그대로 진행한다.
      await activateDemoOrganization(account).catch(() => undefined);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      pendingSignIn = null;
    });
  return pendingSignIn;
}

// 데모 계정으로 로그인하는 중이면 true를 돌려준다. 데모 모드가 아니면 항상 false다.
export function useDemoAutoSignIn(session: {
  authenticated: boolean;
  pending: boolean;
  // 데모 계정으로 로그인된 직후 한 번 부른다.
  onSignedIn: () => void;
  refetch: () => Promise<unknown>;
}): boolean {
  const { authenticated, onSignedIn, refetch } = session;
  // signedIn은 로그인 요청은 끝났고 session이 로그인 상태로 바뀌기를 기다리는 단계다.
  const [phase, setPhase] = useState<
    'idle' | 'signingIn' | 'signedIn' | 'failed'
  >('idle');
  const running = useRef(false);
  const shouldStart =
    demoAccount !== null &&
    !session.pending &&
    !authenticated &&
    phase === 'idle';

  // 로그인된 뒤에는 처음 단계로 돌려 둔다. 나중에 session이 사라지면 다시 로그인한다.
  if (authenticated && phase !== 'idle') setPhase('idle');

  useEffect(() => {
    if (!shouldStart || !demoAccount || running.current) return;
    running.current = true;
    setPhase('signingIn');
    void signInDemoAccount(demoAccount).then(async (signedIn) => {
      if (signedIn) await refetch();
      running.current = false;
      setPhase(signedIn ? 'signedIn' : 'failed');
      if (signedIn) onSignedIn();
    });
  }, [shouldStart, onSignedIn, refetch]);

  return shouldStart || phase === 'signingIn';
}
