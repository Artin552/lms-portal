import crypto from 'node:crypto';
import type { Group, User } from '@prisma/client';

export function fullName(u: Pick<User, 'lastName' | 'firstName' | 'middleName'>) {
  return [u.lastName, u.firstName, u.middleName].filter(Boolean).join(' ');
}

export function shortName(u: Pick<User, 'lastName' | 'firstName' | 'middleName'>) {
  return `${u.lastName} ${u.firstName[0]}.${u.middleName ? ` ${u.middleName[0]}.` : ''}`;
}

export function avatarUrl(u: Pick<User, 'id' | 'avatarKey'>) {
  if (!u.avatarKey) return null;
  const v = crypto.createHash('md5').update(u.avatarKey).digest('hex').slice(0, 8);
  return `/api/users/${u.id}/avatar?v=${v}`;
}

/** Публичные данные пользователя — то, что видят другие участники портала */
export function publicUser(u: User & { group?: Group | null }) {
  return {
    id: u.id,
    role: u.role,
    lastName: u.lastName,
    firstName: u.firstName,
    middleName: u.middleName,
    fullName: fullName(u),
    shortName: shortName(u),
    avatarUrl: avatarUrl(u),
    department: u.department,
    group: u.group ? { id: u.group.id, name: u.group.name } : null,
  };
}

/** Данные своего профиля (+ логин и email) */
export function selfUser(u: User & { group?: Group | null }) {
  return { ...publicUser(u), login: u.login, email: u.email };
}
