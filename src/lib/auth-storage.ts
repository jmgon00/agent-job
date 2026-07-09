export interface StoredUser {
  id: string;
  email: string;
}

const ID_KEY = "agentjob_user_id";
const EMAIL_KEY = "agentjob_user_email";

export function getStoredUser(): StoredUser | null {
  const id = localStorage.getItem(ID_KEY);
  const email = localStorage.getItem(EMAIL_KEY);
  if (!id || !email) return null;
  return { id, email };
}

export function setStoredUser(user: StoredUser): void {
  localStorage.setItem(ID_KEY, user.id);
  localStorage.setItem(EMAIL_KEY, user.email);
}

export function clearStoredUser(): void {
  localStorage.removeItem(ID_KEY);
  localStorage.removeItem(EMAIL_KEY);
}
