const API = '';

export type Me = {
  connected: boolean;
  profile: {
    sub: string;
    name?: string;
    nickname?: string;
    preferred_username?: string;
    picture?: string;
    profile?: string;
  } | null;
  scopes: string[];
};

export async function getMe(): Promise<Me> {
  const response = await fetch(`${API}/api/me`, {
    credentials: 'include'
  });
  return response.json();
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    credentials: 'include'
  });

  if (!response.ok) throw new Error('request_failed');

  return response.json();
}

export async function mutate(path: string, method: string) {
  await fetch(`${API}${path}`, {
    method,
    credentials: 'include'
  });
}

export function connectUrl() {
  return `${API}/api/oauth/start`;
}