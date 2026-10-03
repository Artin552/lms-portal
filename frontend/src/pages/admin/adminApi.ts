import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { PublicUser, Ref } from '../../api/types';

export interface AdminGroup extends Ref {
  course: number;
  studentsCount: number;
}
export interface AdminSubject {
  id: number;
  name: string;
  shortName: string | null;
}
export interface AdminUser extends PublicUser {
  login: string;
  email: string;
  isActive: boolean;
}
export interface AdminTeaching {
  id: number;
  teacher: PublicUser;
  subject: Ref;
  group: Ref;
}

export const useGroups = () =>
  useQuery({ queryKey: ['admin', 'groups'], queryFn: async () => (await api.get<AdminGroup[]>('/admin/groups')).data });

export const useSubjects = () =>
  useQuery({ queryKey: ['admin', 'subjects'], queryFn: async () => (await api.get<AdminSubject[]>('/admin/subjects')).data });

export const useTeachers = () =>
  useQuery({
    queryKey: ['admin', 'users', 'TEACHER'],
    queryFn: async () => (await api.get<AdminUser[]>('/admin/users', { params: { role: 'TEACHER' } })).data,
  });
