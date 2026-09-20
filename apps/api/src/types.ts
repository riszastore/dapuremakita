export const ROLES = ['SUPER_ADMIN', 'CURATOR', 'OPERATIONS', 'PARTNER', 'CUSTOMER', 'NAZHIR_VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export type SafeUser = { id: string; email: string; name: string; role: Role };
export type StoredUser = SafeUser & { passwordHash: string };
export interface UserRepository { findByEmail(email: string): Promise<StoredUser | null>; findById(id: string): Promise<SafeUser | null>; }

declare global {
  namespace Express { interface Request { user?: SafeUser } }
}
