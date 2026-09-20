import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { SafeUser, StoredUser, UserRepository } from '../types.js';

export const AUTH_COOKIE = 'dm_auth';
const publicUser = (user: StoredUser): SafeUser => ({ id: user.id, email: user.email, name: user.name, role: user.role });

export class AuthService {
  constructor(private readonly users: UserRepository) {}
  async login(email: string, password: string): Promise<{ user: SafeUser; token: string } | null> {
    const user = await this.users.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
    return { user: publicUser(user), token: jwt.sign({ sub: user.id }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }) };
  }
  verify(token: string): string {
    const payload = jwt.verify(token, config.JWT_SECRET);
    if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('Invalid token');
    return payload.sub;
  }
  findById(id: string) { return this.users.findById(id); }
}
