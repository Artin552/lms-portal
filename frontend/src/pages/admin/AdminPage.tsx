import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '../../components/ui';
import { GroupsTab, SubjectsTab } from './DictionaryTabs';
import { ScheduleTab } from './ScheduleTab';
import { TeachingsTab } from './TeachingsTab';
import { UsersTab } from './UsersTab';

const TABS = [
  { value: 'users', label: 'Пользователи' },
  { value: 'groups', label: 'Группы' },
  { value: 'subjects', label: 'Предметы' },
  { value: 'teachings', label: 'Преподаватели' },
  { value: 'schedule', label: 'Расписание' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'users') as Tab;

  return (
    <div>
      <PageHeader title="Админ-панель" subtitle="Пользователи, учебная структура и расписание" />
      <div className="mb-5">
        <Tabs value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} items={[...TABS]} />
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'groups' && <GroupsTab />}
      {tab === 'subjects' && <SubjectsTab />}
      {tab === 'teachings' && <TeachingsTab />}
      {tab === 'schedule' && <ScheduleTab />}
    </div>
  );
}
