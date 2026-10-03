export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
export type LessonType = 'LECTURE' | 'PRACTICE' | 'LAB';
export type WeekParity = 'ALL' | 'ODD' | 'EVEN';
export type StudentStatus = 'pending' | 'submitted' | 'returned' | 'graded' | 'overdue';
export type SubmissionStatus = 'SUBMITTED' | 'GRADED' | 'RETURNED';
export type ChatType = 'DIRECT' | 'GROUP' | 'SUBJECT';

export interface Ref {
  id: number;
  name: string;
}

export interface PublicUser {
  id: number;
  role: Role;
  lastName: string;
  firstName: string;
  middleName: string | null;
  fullName: string;
  shortName: string;
  avatarUrl: string | null;
  department: string | null;
  group: Ref | null;
}

export interface SelfUser extends PublicUser {
  login: string;
  email: string;
}

export interface Profile extends SelfUser {
  teachings: { id: number; subject: Ref; group: Ref }[];
}

export interface FileRef {
  id: number;
  fileName: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  url: string;
}

export interface ScheduleEntry {
  id: number;
  dayOfWeek: number;
  pairNumber: number;
  startTime: string;
  endTime: string;
  type: LessonType;
  room: string;
  weekParity: WeekParity;
  subject: Ref;
  group: Ref;
  teacher: { id: number; shortName: string };
}

export interface WeekSchedule {
  weekNumber: number;
  parity: 'ODD' | 'EVEN';
  weekStart: string;
  entries: ScheduleEntry[];
}

export interface Assignment {
  id: number;
  title: string;
  description: string;
  deadline: string;
  maxScore: number;
  createdAt: string;
  subject: Ref;
  teacher: { id: number; shortName: string; fullName: string };
  groups: Ref[];
  files: FileRef[];
  // для студента
  status?: StudentStatus;
  canSubmit?: boolean;
  score?: number | null;
  submission?: Submission | null;
  // для преподавателя
  stats?: { students: number; submitted: number; toCheck: number; graded: number };
}

export interface Submission {
  id: number;
  text: string;
  status: SubmissionStatus;
  score: number | null;
  teacherComment: string | null;
  attempt: number;
  submittedAt: string;
  gradedAt: string | null;
  files: FileRef[];
  student?: PublicUser;
}

export interface SubmissionRow {
  student: PublicUser;
  status: StudentStatus;
  submission: Submission | null;
}

export interface Message {
  id: number;
  chatId: number;
  sender: { id: number; shortName: string; fullName: string; role: Role; avatarUrl: string | null };
  text: string;
  createdAt: string;
  deletedAt: string | null;
  pinnedAt: string | null;
  pinnedBy: { id: number; shortName: string } | null;
  attachments: FileRef[];
}

export interface ChatListItem {
  id: number;
  type: ChatType;
  title: string;
  group: Ref | null;
  subject: Ref | null;
  peer: PublicUser | null;
  membersCount: number;
  lastMessage: Message | null;
  unread: number;
  updatedAt: string;
}

export interface ChatDetails extends Omit<ChatListItem, 'lastMessage' | 'unread' | 'updatedAt'> {
  canModerate: boolean;
  members: (PublicUser & { lastReadAt: string | null })[];
  pinned: Message[];
}

export interface Notification {
  id: number;
  type: 'NEW_ASSIGNMENT' | 'DEADLINE_SOON' | 'GRADED' | 'RETURNED' | 'NEW_MESSAGE';
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
