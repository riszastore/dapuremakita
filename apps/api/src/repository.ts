import { PrismaClient } from '@prisma/client';
import type { SafeUser, StoredUser, UserRepository } from './types.js';

const safe = (user: StoredUser): SafeUser => ({ id: user.id, email: user.email, name: user.name, role: user.role });

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async findByEmail(email: string): Promise<StoredUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? { ...user, role: user.role as StoredUser['role'] } : null;
  }
  async findById(id: string): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? safe({ ...user, role: user.role as StoredUser['role'] }) : null;
  }
}
