import { FormEvent, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  LayoutDashboard,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  Search,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import './styles.css';

type Status = 'Pending' | 'In Progress' | 'Completed' | 'Rejected';
type View = 'dashboard' | 'tickets' | 'reports' | 'assets' | 'admin';
type ReportPeriod = 'range' | 'month' | 'year';
type Language = 'th' | 'en';
type Attachment = {
  name: string;
  type: string;
  data: string; // base64 encoded
};
type Ticket = {
  id: string;
  storeName: string;
  category: string;
  description: string;
  assignee: string;
  status: Status;
  approval: '' | 'Approved' | 'Rejected';
  createdAt: string;
  completedAt?: string;
  attachments?: Attachment[];
};
type TicketForm = Omit<Ticket, 'id' | 'approval' | 'createdAt' | 'attachments'> & { attachments?: Attachment[] };
type AssetStatus = 'In Use' | 'Available' | 'Maintenance';
const usdExchangeRate = 35;
type Asset = {
  id: string;
  assetName: string;
  category: string;
  serialNumber: string;
  location: string;
  owner: string;
  status: AssetStatus;
  purchaseDate: string;
  installationDate?: string;
  vendor?: string;
  priceBeforeVat?: number;
  priceBeforeVatUsd?: number;
  remark?: string;
  replacementAvailability?: 'yes' | 'no';
  replacementDetails?: string;
};
type UserPermission = {
  dashboard: boolean;
  tickets: boolean;
  assets: boolean;
  reports: boolean;
  administrator: boolean;
};
type User = {
  staffId: string;
  name: string;
  password: string;
  role: 'admin' | 'user';
  permissions: UserPermission;
};
type LocationMasterItem = {
  id: string;
  shortName: string;
  fullName: string;
  budget?: number;
};

type MasterData = {
  categories: string[];
  assetTypes: string[];
  vendors: string[];
  locations: LocationMasterItem[];
};

const normalizeLocationEntry = (value: string | LocationMasterItem | null | undefined): LocationMasterItem => {
  if (!value) return { id: '', shortName: '', fullName: '' };
  if (typeof value === 'string') {
    const match = value.match(/^([A-Za-z0-9]+)\s*[-–]\s*(.+?)(?:\s*[-–]\s*(.+))?$/);
    if (match) {
      return {
        id: match[1].trim(),
        shortName: match[2].trim(),
        fullName: match[3]?.trim() ?? '',
      };
    }
    const legacyMatch = value.match(/^(\d+)\s+([A-Za-z0-9]+)\s+(.+)$/);
    if (legacyMatch) {
      return {
        id: legacyMatch[1].trim(),
        shortName: legacyMatch[2].trim(),
        fullName: legacyMatch[3].trim(),
      };
    }
    return { id: value.trim(), shortName: '', fullName: value.trim() };
  }

  const rawId = value.id?.trim() ?? '';
  const embeddedLocation = rawId.match(/^([A-Za-z0-9]+)\s*[-–]\s*(.+?)\s*[-–]\s*(.+)$/);
  return {
    id: embeddedLocation?.[1] ?? rawId,
    shortName: embeddedLocation?.[2] ?? value.shortName?.trim() ?? '',
    fullName: embeddedLocation?.[3] ?? value.fullName?.trim() ?? '',
    budget: typeof value.budget === 'number' && Number.isFinite(value.budget) && value.budget >= 0 ? value.budget : undefined,
  };
};

const formatLocationLabel = (value: string | LocationMasterItem) => {
  const location = normalizeLocationEntry(value);
  if (!location.id && !location.shortName && !location.fullName) return '';
  if (location.shortName && location.fullName) return `${location.id} - ${location.shortName} - ${location.fullName}`;
  if (location.shortName) return `${location.id} - ${location.shortName}`;
  return location.fullName || location.id;
};

const locationIdentity = (value: string | LocationMasterItem) => {
  const location = normalizeLocationEntry(value);
  return location.id.toLowerCase();
};

const deduplicateLocations = (locations: Array<string | LocationMasterItem>) => {
  const unique = new Map<string, LocationMasterItem>();
  locations.map((location) => normalizeLocationEntry(location)).forEach((location) => {
    if (location.id) unique.set(locationIdentity(location), location);
  });
  return [...unique.values()];
};

const formatResolutionDuration = (createdAt: string, completedAt: string | undefined, language: Language = 'th') => {
  if (!completedAt) return '-';
  const durationMinutes = Math.max(0, Math.floor((new Date(completedAt).getTime() - new Date(createdAt).getTime()) / 60000));
  const days = Math.floor(durationMinutes / 1440);
  const hours = Math.floor((durationMinutes % 1440) / 60);
  const minutes = durationMinutes % 60;
  return language === 'en'
    ? [days && `${days}d`, hours && `${hours}h`, `${minutes}m`].filter(Boolean).join(' ')
    : [days && `${days} วัน`, hours && `${hours} ชม.`, `${minutes} นาที`].filter(Boolean).join(' ');
};

const getAssetUsageMonths = (asset: Asset) => {
  const usageStartDate = asset.installationDate || asset.purchaseDate;
  if (!usageStartDate) return null;

  const startDate = new Date(`${usageStartDate}T00:00:00`);
  if (Number.isNaN(startDate.getTime())) return null;

  const today = new Date();
  let months = (today.getFullYear() - startDate.getFullYear()) * 12 + today.getMonth() - startDate.getMonth();
  if (today.getDate() < startDate.getDate()) months -= 1;
  return Math.max(0, months);
};

const formatAssetUsageDuration = (months: number, language: Language = 'th') => language === 'en' ? `${Math.floor(months / 12)}y ${months % 12}m` : `${Math.floor(months / 12)} ปี ${months % 12} เดือน`;

const translations = {
  th: { workspace: 'WORKSPACE', tickets: 'จัดการ Ticket', assets: 'จัดเก็บอุปกรณ์', reports: 'รายงานย้อนหลัง', admin: 'ผู้ดูแลระบบ', subtitle: 'ติดตาม แก้ไข และอนุมัติคำขอจากทุกสาขา', logout: 'ออกจากระบบ', language: 'English', dashboardReport: 'ดึงรายงาน Dashboard', downloadAll: 'ดาวน์โหลดทุกคอลัมน์', selectRange: 'เลือกช่วงวันที่', selectMonth: 'เลือกเดือน', selectYear: 'เลือกปี', from: 'ตั้งแต่วันที่', to: 'ถึงวันที่', month: 'Month', year: 'Year', allMonths: 'All months', allYears: 'All years', showing: 'แสดง Ticket', assetItems: 'รายการ และ Asset', items: 'รายการตามช่วงเวลาที่เลือก', totalTickets: 'รวม Ticket', pendingApproval: 'รออนุมัติ', equipmentInUse: 'อุปกรณ์ใช้งาน', maintenance: 'ซ่อมบำรุง' },
  en: { workspace: 'WORKSPACE', tickets: 'Ticket Management', assets: 'Asset Inventory', reports: 'Historical Reports', admin: 'Administrator', subtitle: 'Track, resolve, and approve requests from every branch', logout: 'Log out', language: 'ไทย', dashboardReport: 'Dashboard Report', downloadAll: 'Download all columns', selectRange: 'Date range', selectMonth: 'Month', selectYear: 'Year', from: 'From', to: 'To', month: 'Month', year: 'Year', allMonths: 'All months', allYears: 'All years', showing: 'Showing', assetItems: 'tickets and', items: 'assets for the selected period', totalTickets: 'Total Tickets', pendingApproval: 'Pending Approval', equipmentInUse: 'Assets In Use', maintenance: 'Maintenance' },
} as const;
let activeLanguage: Language = 'th';

const emptyForm: TicketForm = { storeName: '', category: '', description: '', assignee: '', status: 'Pending', attachments: [] };
const defaultUserPermissions = (): UserPermission => ({
  dashboard: true,
  tickets: true,
  assets: true,
  reports: true,
  administrator: false,
});
const normalizeUserPermissions = (role: 'admin' | 'user', permissions?: Partial<UserPermission>): UserPermission => {
  const normalized = {
    dashboard: permissions?.dashboard ?? true,
    tickets: permissions?.tickets ?? true,
    assets: permissions?.assets ?? true,
    reports: permissions?.reports ?? true,
    administrator: permissions?.administrator ?? false,
  };

  if (role === 'admin' || permissions?.administrator) {
    return {
      dashboard: true,
      tickets: true,
      assets: true,
      reports: true,
      administrator: true,
    };
  }

  return normalized;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) {
    try {
      const data = await response.json();
      throw new Error(data.message || data.error || `Error: ${response.statusText}`);
    } catch (parseError) {
      throw new Error(`Error: ${response.statusText}`);
    }
  }
  return response.json();
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('app-language') as Language) || 'th');
  const [currentStaffId, setCurrentStaffId] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [masterData, setMasterData] = useState<MasterData>({ categories: [], assetTypes: [], vendors: [], locations: [] });
  const [view, setView] = useState<View>('dashboard');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('range');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportMonth, setReportMonth] = useState('');
  const [reportYear, setReportYear] = useState('');
  const [dashboardPeriod, setDashboardPeriod] = useState<ReportPeriod>('range');
  const [dashboardStartDate, setDashboardStartDate] = useState('');
  const [dashboardEndDate, setDashboardEndDate] = useState('');
  const [dashboardMonth, setDashboardMonth] = useState('');
  const [dashboardYear, setDashboardYear] = useState('');
  const [modal, setModal] = useState<Ticket | 'new' | null>(null);
  const [assetModal, setAssetModal] = useState<Asset | 'new' | null>(null);
  const [assetSaving, setAssetSaving] = useState(false);
  const [userModal, setUserModal] = useState<User | 'new' | null>(null);
  const [attachmentModal, setAttachmentModal] = useState<Ticket | null>(null);
  const [form, setForm] = useState<TicketForm>(emptyForm);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [assetForm, setAssetForm] = useState<Partial<Asset>>({
    assetName: '',
    category: '',
    serialNumber: '',
    location: '',
    owner: 'Tanakit Lertmana',
    status: 'In Use',
    purchaseDate: '',
  });
  const [userForm, setUserForm] = useState<Partial<User>>({
    staffId: '',
    name: '',
    password: '',
    role: 'user',
    permissions: defaultUserPermissions(),
  });
  const [error, setError] = useState('');
  const currentUserName = users.find((user) => user.staffId === currentStaffId)?.name ?? currentStaffId;
  const t = translations[language];
  activeLanguage = language;
  const toggleLanguage = () => {
    const nextLanguage = language === 'th' ? 'en' : 'th';
    setLanguage(nextLanguage);
    localStorage.setItem('app-language', nextLanguage);
  };

  async function loadTickets() {
    try {
      setTickets(await request<Ticket[]>('/api/tickets'));
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }

  async function loadAssets() {
    try {
      setAssets(await request<Asset[]>('/api/assets'));
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }

  async function loadUsers() {
    try {
      setUsers(await request<User[]>('/api/users'));
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }

  async function loadMasterData() {
    try {
      const data = await request<MasterData>('/api/master-data');
      const normalized = {
        ...data,
        assetTypes: data.assetTypes ?? [],
        locations: deduplicateLocations(data.locations ?? []),
      };
      setMasterData(normalized);
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }

  const persistMasterData = async (nextData: MasterData) => {
    try {
      const saved = await request<MasterData>('/api/master-data', {
        method: 'PUT',
        body: JSON.stringify(nextData),
      });
      setMasterData({
        ...saved,
        assetTypes: saved.assetTypes ?? [],
        locations: deduplicateLocations(saved.locations ?? []),
      });
    } catch (saveError) {
      setError((saveError as Error).message);
    }
  };

  useEffect(() => {
    if (loggedIn) {
      void loadTickets();
      void loadAssets();
      void loadUsers();
      void loadMasterData();
    }
  }, [loggedIn]);

  const filteredTickets = tickets.filter((ticket) => {
    const text = `${ticket.id} ${ticket.storeName} ${ticket.category} ${ticket.description}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (!statusFilter || ticket.status === statusFilter) && (!approvalFilter || (approvalFilter === 'pending' ? !ticket.approval : ticket.approval === approvalFilter));
  });

  const openForm = (ticket?: Ticket) => {
    setForm(
      ticket
        ? { storeName: ticket.storeName, category: ticket.category, description: ticket.description, assignee: ticket.assignee, status: ticket.status, attachments: ticket.attachments }
        : { ...emptyForm, assignee: currentStaffId },
    );
    setAttachmentFiles([]);
    setModal(ticket ?? 'new');
  };

  const saveTicket = async (event: FormEvent) => {
    event.preventDefault();
    try {
      let attachments: Attachment[] = form.attachments ?? [];
      
      // Convert files to base64
      if (attachmentFiles.length > 0) {
        for (const file of attachmentFiles) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64Data = result.includes(',') ? result.split(',')[1] : result;
              resolve(base64Data);
            };
            reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
            reader.readAsDataURL(file);
          });
          attachments.push({ name: file.name, type: file.type, data: base64 });
        }
      }
      
      const ticketData = { ...form, attachments };
      
      if (modal !== 'new' && modal) {
        await request(`/api/tickets/${modal.id}`, { method: 'PATCH', body: JSON.stringify(ticketData) });
      } else {
        await request('/api/tickets', { method: 'POST', body: JSON.stringify(ticketData) });
      }
      setModal(null);
      setAttachmentFiles([]);
      await loadTickets();
    } catch (saveError) {
      setError((saveError as Error).message);
    }
  };

  const approve = async (ticket: Ticket, decision: 'Approved' | 'Rejected') => {
    try {
      await request(`/api/tickets/${ticket.id}/approval`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, approvedBy: currentUserName, approverStaffId: currentStaffId }),
      });
      await loadTickets();
    } catch (approveError) {
      setError((approveError as Error).message);
    }
  };

  const updateTicketStatus = async (ticket: Ticket, status: Ticket['status']) => {
    try {
      await request(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadTickets();
    } catch (statusError) {
      setError((statusError as Error).message);
    }
  };

  const reportYears = [...new Set([...tickets.map((ticket) => ticket.createdAt.slice(0, 4)), String(new Date().getFullYear())])].sort((a, b) => Number(b) - Number(a));
  const reportTickets = tickets.filter((ticket) => {
    const ticketDate = ticket.createdAt.slice(0, 10);
    if (reportPeriod === 'month') return (!reportMonth || ticket.createdAt.slice(5, 7) === reportMonth) && (!reportYear || ticket.createdAt.slice(0, 4) === reportYear);
    if (reportPeriod === 'year') return !reportYear || ticket.createdAt.slice(0, 4) === reportYear;
    return (!reportStartDate || ticketDate >= reportStartDate) && (!reportEndDate || ticketDate <= reportEndDate);
  });

  const dashboardYears = [...new Set([
    ...tickets.map((ticket) => ticket.createdAt.slice(0, 4)),
    ...assets.flatMap((asset) => [asset.installationDate, asset.purchaseDate]).filter((date): date is string => !!date).map((date) => date.slice(0, 4)),
    String(new Date().getFullYear()),
  ])].sort((a, b) => Number(b) - Number(a));
  const isDashboardDateInPeriod = (date: string) => {
    const datePart = date.slice(0, 10);
    if (dashboardPeriod === 'month') return (!dashboardMonth || date.slice(5, 7) === dashboardMonth) && (!dashboardYear || date.slice(0, 4) === dashboardYear);
    if (dashboardPeriod === 'year') return !dashboardYear || date.slice(0, 4) === dashboardYear;
    return (!dashboardStartDate || datePart >= dashboardStartDate) && (!dashboardEndDate || datePart <= dashboardEndDate);
  };
  const dashboardTickets = tickets.filter((ticket) => isDashboardDateInPeriod(ticket.createdAt));
  const dashboardAssets = assets.filter((asset) => {
    const date = asset.installationDate || asset.purchaseDate;
    return date ? isDashboardDateInPeriod(date) : (!dashboardStartDate && !dashboardEndDate && !dashboardMonth && !dashboardYear);
  });

  const exportDashboardCsv = () => {
    const rows = [
      ['Type', 'ID', 'Created/Purchase Date', 'Completed/Installation Date', 'Store/Location', 'Category/Asset Type', 'Description/Asset Name', 'Assignee/Owner', 'Status', 'Approval/Vendor', 'Serial Number', 'Price Before VAT (THB)', 'Price Before VAT (USD)', 'Resolution Time'],
      ...dashboardTickets.map((ticket) => ['Ticket', ticket.id, ticket.createdAt, ticket.completedAt || '-', ticket.storeName, ticket.category, ticket.description, users.find((user) => user.staffId === ticket.assignee)?.name ?? ticket.assignee, ticket.status, ticket.approval || '-', '-', '-', '-', formatResolutionDuration(ticket.createdAt, ticket.completedAt)]),
      ...dashboardAssets.map((asset) => ['Asset', asset.id, asset.purchaseDate || '-', asset.installationDate || '-', asset.location, asset.category, asset.assetName, asset.owner, asset.status, asset.vendor || '-', asset.serialNumber || '-', asset.priceBeforeVat ?? 0, asset.priceBeforeVatUsd ?? (asset.priceBeforeVat ?? 0) / usdExchangeRate, '-']),
    ].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv' }));
    link.download = 'dashboard-report.csv';
    link.click();
  };

  const exportCsv = () => {
    const csv = [
      'ID,Store,Category,Description,Assignee,Status,Approval,Created,Completed,Resolution Time',
      ...reportTickets.map((ticket) => {
        const assigneeName = users.find((user) => user.staffId === ticket.assignee)?.name ?? ticket.assignee;
        return [ticket.id, ticket.storeName, ticket.category, ticket.description, assigneeName, ticket.status, ticket.approval, ticket.createdAt, ticket.completedAt || '-', formatResolutionDuration(ticket.createdAt, ticket.completedAt)]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',');
      }),
    ].join('\n');

    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    link.download = 'ticket-report.csv';
    link.click();
  };

  const openAssetForm = (asset?: Asset) => {
    setAssetForm(
      asset
        ? { ...asset, owner: currentUserName }
        : {
            assetName: '',
            category: '',
            serialNumber: '',
            location: '201 MGB Mega Bangna',
            owner: currentUserName,
            status: 'In Use',
            purchaseDate: '',
            installationDate: '',
            vendor: '',
            remark: '',
            replacementAvailability: undefined,
            replacementDetails: '',
          },
    );
    setAssetModal(asset ?? 'new');
  };

  const saveAsset = async (event: FormEvent) => {
    event.preventDefault();
    if (!assetForm.assetName || !assetForm.category || !assetForm.location) return;

    const serialNumber = assetForm.serialNumber?.trim();
    const isDuplicateSerial = serialNumber && assets.some((asset) =>
      asset.id !== (assetModal !== 'new' ? assetModal?.id : undefined)
      && asset.serialNumber.trim().toLowerCase() === serialNumber.toLowerCase(),
    );
    if (isDuplicateSerial) {
      setError(activeLanguage === 'en' ? `Serial Number ${serialNumber} already exists` : `Serial Number ${serialNumber} มีอยู่ในระบบแล้ว`);
      return;
    }

    const assetData = {
      ...assetForm,
      serialNumber: serialNumber ?? '',
      owner: currentUserName,
      status: (assetForm.status as AssetStatus) ?? 'In Use',
      purchaseDate: assetForm.purchaseDate ?? '',
      priceBeforeVatUsd: (assetForm.priceBeforeVat ?? 0) / usdExchangeRate,
      replacementAvailability: assetForm.status === 'Maintenance' ? assetForm.replacementAvailability : undefined,
      replacementDetails: assetForm.status === 'Maintenance' && assetForm.replacementAvailability === 'yes' ? assetForm.replacementDetails : '',
    };

    try {
      setAssetSaving(true);
      if (assetModal && assetModal !== 'new') {
        await request(`/api/assets/${assetModal.id}`, { method: 'PATCH', body: JSON.stringify(assetData) });
      } else {
        await request('/api/assets', { method: 'POST', body: JSON.stringify(assetData) });
      }
      setAssetModal(null);
      await loadAssets();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setAssetSaving(false);
    }
  };

  const deleteAsset = async (asset: Asset) => {
    if (!window.confirm(activeLanguage === 'en' ? `Delete asset ${asset.assetName}?` : `ต้องการลบอุปกรณ์ ${asset.assetName} ใช่หรือไม่?`)) return;

    try {
      await request(`/api/assets/${asset.id}`, { method: 'DELETE' });
      await loadAssets();
    } catch (deleteError) {
      setError((deleteError as Error).message);
    }
  };

  const openUserForm = (user?: User) => {
    setUserForm(
      user
        ? {
            staffId: user.staffId,
            name: user.name,
            password: user.password,
            role: user.role,
            permissions: { ...user.permissions },
          }
        : {
            staffId: '',
            name: '',
            password: '',
            role: 'user',
            permissions: defaultUserPermissions(),
          },
    );
    setUserModal(user ?? 'new');
  };

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      ...userForm,
      staffId: userForm.staffId?.trim(),
      name: userForm.name?.trim(),
      password: userForm.password?.trim(),
      role: userForm.role ?? 'user',
      permissions: normalizeUserPermissions(userForm.role ?? 'user', userForm.permissions),
    };

    if (!payload.staffId || !payload.name || !payload.password) return;

    try {
      if (userModal && userModal !== 'new') {
        await request(`/api/users/${userModal.staffId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await request('/api/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setUserModal(null);
      await loadUsers();
    } catch (saveError) {
      setError((saveError as Error).message);
    }
  };

  if (!loggedIn) return <Login onLogin={(staffId) => { setCurrentStaffId(staffId); setLoggedIn(true); }} />;

  const pending = tickets.filter((ticket) => !ticket.approval).length;
  const isAdmin = users.some((user) => user.staffId === currentStaffId && user.role === 'admin');

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="mark">OD</span>
          <b>
            TICKET
            <br />
            CONTROL
          </b>
        </div>
        <small className="nav-label">{t.workspace}</small>
        <nav>
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
            <LayoutDashboard size={17} /> Dashboard
          </button>
          <button className={view === 'tickets' ? 'active' : ''} onClick={() => setView('tickets')}>
            <ClipboardList size={17} /> {t.tickets}
          </button>
          <button className={view === 'assets' ? 'active' : ''} onClick={() => setView('assets')}>
            <Warehouse size={17} /> {t.assets}
          </button>
          <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>
            <BarChart3 size={17} /> {t.reports}
          </button>
          <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>
            <Monitor size={17} /> {t.admin}
          </button>
        </nav>
        <div className="side-note">
          ระบบจัดการคำขอ IT
          <br />
          <strong>Express + React</strong>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>
              {view === 'dashboard' && 'Dashboard'}
              {view === 'tickets' && t.tickets}
              {view === 'assets' && t.assets}
              {view === 'reports' && t.reports}
              {view === 'admin' && t.admin}
            </h1>
            <p>{t.subtitle}</p>
          </div>
          <div className="user">
            <span className="avatar">TL</span>
            <span>Tanakit Lertmana</span>
            <button className="ghost language-toggle" onClick={toggleLanguage} title="Change language">
              {t.language}
            </button>
            <button className="ghost" onClick={() => setLoggedIn(false)}>
              <LogOut size={15} /> {t.logout}
            </button>
          </div>
        </header>

        {error && (
          <div className="alert">
            {error}
            <button onClick={() => setError('')}>
              <X size={15} />
            </button>
          </div>
        )}

        {view === 'dashboard' && <DashboardView tickets={dashboardTickets} assets={dashboardAssets} users={users} masterData={masterData} language={language} period={dashboardPeriod} startDate={dashboardStartDate} endDate={dashboardEndDate} month={dashboardMonth} year={dashboardYear} years={dashboardYears} onPeriodChange={setDashboardPeriod} onStartDateChange={setDashboardStartDate} onEndDateChange={setDashboardEndDate} onMonthChange={setDashboardMonth} onYearChange={setDashboardYear} onExport={exportDashboardCsv} />}

        {view === 'tickets' && (
          <>
            <section className="stats">
              <Stat label={language === 'en' ? 'Total' : 'ทั้งหมด'} value={tickets.length} note={language === 'en' ? 'tickets' : 'รายการ'} />
              <Stat label={language === 'en' ? 'Pending Approval' : 'รออนุมัติ'} value={pending} note={language === 'en' ? 'Needs review' : 'ต้องตรวจสอบ'} />
              <Stat label={language === 'en' ? 'In Progress' : 'กำลังดำเนินการ'} value={tickets.filter((ticket) => ticket.status === 'In Progress').length} note={language === 'en' ? 'tickets' : 'รายการ'} />
              <Stat label={language === 'en' ? 'Completed' : 'เสร็จสิ้น'} value={tickets.filter((ticket) => ticket.status === 'Completed').length} note={language === 'en' ? 'tickets' : 'รายการ'} />
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>{language === 'en' ? 'Requests' : 'รายการคำขอ'}</h2>
                <button className="primary" onClick={() => openForm()}>
                  <Plus size={16} /> {language === 'en' ? 'Create Ticket' : 'สร้าง Ticket'}
                </button>
              </div>

              <div className="filters">
                <label className="search">
                  <Search size={16} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === 'en' ? 'Search ID, branch, or description' : 'ค้นหา ID, สาขา หรือรายละเอียด'} />
                </label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">{language === 'en' ? 'All statuses' : 'ทุกสถานะ'}</option>
                  <option>Pending</option>
                  <option>In Progress</option>
                  <option>Completed</option>
                  <option>Rejected</option>
                </select>
                <select value={approvalFilter} onChange={(event) => setApprovalFilter(event.target.value)}>
                  <option value="">{language === 'en' ? 'All approval statuses' : 'ทุกสถานะอนุมัติ'}</option>
                  <option value="pending">{language === 'en' ? 'Pending review' : 'รอตรวจสอบ'}</option>
                  <option value="Approved">{language === 'en' ? 'Approved' : 'อนุมัติแล้ว'}</option>
                  <option value="Rejected">{language === 'en' ? 'Rejected' : 'ไม่อนุมัติ'}</option>
                </select>
              </div>

              <div className="table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>{language === 'en' ? 'Branch' : 'สาขา'}</th>
                      <th>{language === 'en' ? 'Category' : 'หมวดหมู่'}</th>
                      <th>{language === 'en' ? 'Description' : 'รายละเอียด'}</th>
                      <th>{language === 'en' ? 'Assignee' : 'ผู้รับผิดชอบ'}</th>
                      <th>{language === 'en' ? 'Status' : 'สถานะ'}</th>
                      <th>{language === 'en' ? 'Approval' : 'อนุมัติ'}</th>
                      <th>{language === 'en' ? 'Actions' : 'จัดการ'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((ticket) => (
                      <TicketRow key={ticket.id} ticket={ticket} users={users} language={language} isAdmin={isAdmin} onEdit={() => openForm(ticket)} onApprove={(decision) => void approve(ticket, decision)} onStatusChange={(status) => void updateTicketStatus(ticket, status)} onViewAttachments={(t) => setAttachmentModal(t)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {view === 'assets' && <AssetView assets={assets} language={language} onAdd={() => openAssetForm()} onEdit={(asset) => openAssetForm(asset)} onDelete={(asset) => void deleteAsset(asset)} />}

        {view === 'reports' && <Reports tickets={reportTickets} language={language} years={reportYears} period={reportPeriod} startDate={reportStartDate} endDate={reportEndDate} month={reportMonth} year={reportYear} onPeriodChange={setReportPeriod} onStartDateChange={setReportStartDate} onEndDateChange={setReportEndDate} onMonthChange={setReportMonth} onYearChange={setReportYear} onExport={exportCsv} />}

        {view === 'admin' && (
          <AdminView
          users={users}
          language={language}
          masterData={masterData}
          setMasterData={(nextData) => {
            setMasterData(nextData);
            void persistMasterData(nextData);
          }}
          onAddUser={() => openUserForm()}
          onEditUser={(user) => openUserForm(user)}
        />
        )}
      </main>

      {modal && (
        <TicketModal
          form={form}
          setForm={setForm}
          onClose={() => { setModal(null); setAttachmentFiles([]); setError(''); }}
          onSubmit={saveTicket}
          editing={modal !== 'new'}
          masterData={masterData}
          currentStaffId={currentStaffId}
          attachmentFiles={attachmentFiles}
          setAttachmentFiles={setAttachmentFiles}
          error={error}
          setError={setError}
        />
      )}

      {assetModal && (
        <AssetModal
          form={assetForm}
          setForm={setAssetForm}
          onClose={() => setAssetModal(null)}
          onSubmit={saveAsset}
          editing={assetModal !== 'new'}
          masterData={masterData}
          currentUserName={currentUserName}
          assets={assets}
          editingAssetId={assetModal !== 'new' ? assetModal.id : undefined}
          saving={assetSaving}
        />
      )}

      {userModal && (
        <UserModal
          form={userForm}
          setForm={setUserForm}
          onClose={() => setUserModal(null)}
          onSubmit={saveUser}
          editing={userModal !== 'new'}
        />
      )}

      {attachmentModal && (
        <AttachmentModal
          ticket={attachmentModal}
          onClose={() => setAttachmentModal(null)}
        />
      )}
    </div>
  );
}

function DashboardView({ tickets, assets, users, masterData, language, period, startDate, endDate, month, year, years, onPeriodChange, onStartDateChange, onEndDateChange, onMonthChange, onYearChange, onExport }: { tickets: Ticket[]; assets: Asset[]; users: User[]; masterData: MasterData; language: Language; period: ReportPeriod; startDate: string; endDate: string; month: string; year: string; years: string[]; onPeriodChange: (period: ReportPeriod) => void; onStartDateChange: (date: string) => void; onEndDateChange: (date: string) => void; onMonthChange: (month: string) => void; onYearChange: (year: string) => void; onExport: () => void }) {
  const t = translations[language];
  const [assetAgePage, setAssetAgePage] = useState(1);
  const [assetAgeQuery, setAssetAgeQuery] = useState('');
  const totalTickets = tickets.length;
  const pending = tickets.filter((ticket) => !ticket.approval).length;
  const inProgress = tickets.filter((ticket) => ticket.status === 'In Progress').length;
  const completed = tickets.filter((ticket) => ticket.status === 'Completed').length;
  const available = assets.filter((asset) => asset.status === 'Available').length;
  const inUse = assets.filter((asset) => asset.status === 'In Use').length;
  const maintenance = assets.filter((asset) => asset.status === 'Maintenance').length;
  const openTickets = tickets.filter((ticket) => ticket.status === 'Pending' || ticket.status === 'In Progress').length;
  const completionRate = totalTickets ? Math.round((completed / totalTickets) * 100) : 0;
  const reviewedTickets = tickets.filter((ticket) => ticket.approval).length;
  const approvalRate = reviewedTickets ? Math.round((tickets.filter((ticket) => ticket.approval === 'Approved').length / reviewedTickets) * 100) : 0;
  const completedTickets = tickets.filter((ticket) => ticket.completedAt);
  const averageResolutionMinutes = completedTickets.length
    ? Math.floor(completedTickets.reduce((total, ticket) => total + (new Date(ticket.completedAt!).getTime() - new Date(ticket.createdAt).getTime()) / 60000, 0) / completedTickets.length)
    : null;

  const statusCounts = [
    { label: 'Pending', count: tickets.filter((ticket) => ticket.status === 'Pending').length, color: '#c4a15b' },
    { label: 'In Progress', count: inProgress, color: '#2d8aa8' },
    { label: 'Completed', count: completed, color: '#2b9f7d' },
    { label: 'Rejected', count: tickets.filter((ticket) => ticket.status === 'Rejected').length, color: '#d06a5c' },
  ];

  const topCategories = Object.entries(
    tickets.reduce<Record<string, number>>((result, ticket) => {
      result[ticket.category] = (result[ticket.category] ?? 0) + 1;
      return result;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const maxStatus = Math.max(...statusCounts.map((status) => status.count), 1);
  const maxCategory = Math.max(...topCategories.map(([, count]) => count), 1);
  const assigneeKpis = Object.entries(
    tickets.reduce<Record<string, { total: number; completed: number; open: number }>>((result, ticket) => {
      const assignee = users.find((user) => user.staffId === ticket.assignee)?.name ?? ticket.assignee;
      const current = result[assignee] ?? { total: 0, completed: 0, open: 0 };
      current.total += 1;
      if (ticket.status === 'Completed') current.completed += 1;
      if (ticket.status === 'Pending' || ticket.status === 'In Progress') current.open += 1;
      result[assignee] = current;
      return result;
    }, {}),
  ).sort(([, first], [, second]) => second.total - first.total);
  const locationsByIdentity = new Map(masterData.locations.map((location) => [locationIdentity(location), location]));
  const branchSpend = Object.values(
    assets.reduce<Record<string, { location: LocationMasterItem; assetCount: number; spent: number; spentUsd: number }>>((result, asset) => {
      const identity = locationIdentity(asset.location);
      const location = locationsByIdentity.get(identity) ?? normalizeLocationEntry(asset.location);
      const current = result[identity] ?? { location, assetCount: 0, spent: 0, spentUsd: 0 };
      current.assetCount += 1;
      current.spent += asset.priceBeforeVat ?? 0;
      current.spentUsd += asset.priceBeforeVatUsd ?? (asset.priceBeforeVat ?? 0) / usdExchangeRate;
      result[identity] = current;
      return result;
    }, {}),
  ).sort((first, second) => second.spent - first.spent);
  const fourYearAssets = assets
    .map((asset) => ({ asset, usageMonths: getAssetUsageMonths(asset) }))
    .filter((item): item is { asset: Asset; usageMonths: number } => item.usageMonths !== null && item.usageMonths >= 48)
    .sort((first, second) => second.usageMonths - first.usageMonths);
  const normalizedAssetAgeQuery = assetAgeQuery.trim().toLowerCase();
  const filteredFourYearAssets = normalizedAssetAgeQuery
    ? fourYearAssets.filter(({ asset }) => [asset.id, asset.assetName, asset.category, asset.serialNumber, asset.location].some((value) => value.toLowerCase().includes(normalizedAssetAgeQuery)))
    : fourYearAssets;
  const assetAgePageSize = 10;
  const assetAgePageCount = Math.max(1, Math.ceil(filteredFourYearAssets.length / assetAgePageSize));
  const activeAssetAgePage = Math.min(assetAgePage, assetAgePageCount);
  const visibleFourYearAssets = filteredFourYearAssets.slice((activeAssetAgePage - 1) * assetAgePageSize, activeAssetAgePage * assetAgePageSize);

  return (
    <>
      <section className="panel dashboard-report-filters">
        <div className="panel-head">
          <h2>{t.dashboardReport}</h2>
          <button className="ghost" onClick={onExport}><Download size={15} /> {t.downloadAll}</button>
        </div>
        <div className="filters report-filters">
          <select value={period} onChange={(event) => onPeriodChange(event.target.value as ReportPeriod)} aria-label="รูปแบบช่วงเวลา Dashboard">
            <option value="range">{t.selectRange}</option>
            <option value="month">{t.selectMonth}</option>
            <option value="year">{t.selectYear}</option>
          </select>
          {period === 'range' && <><label className="date-filter">{t.from}<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => onStartDateChange(event.target.value)} /></label><label className="date-filter">{t.to}<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => onEndDateChange(event.target.value)} /></label></>}
          {period === 'month' && <><label className="date-filter">Month<select value={month} onChange={(event) => onMonthChange(event.target.value)}><option value="">All months</option>{[['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'], ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'], ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="date-filter">Year<select value={year} onChange={(event) => onYearChange(event.target.value)}><option value="">All years</option>{years.map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}</option>)}</select></label></>}
          {period === 'year' && <label className="date-filter">Year<select value={year} onChange={(event) => onYearChange(event.target.value)}><option value="">All years</option>{years.map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}</option>)}</select></label>}
        </div>
        <span className="report-count">{t.showing} {tickets.length} {t.assetItems} {assets.length} {t.items}</span>
      </section>

      <section className="stats">
        <Stat label={t.totalTickets} value={totalTickets} note={language === 'en' ? 'tickets' : 'รายการ'} />
        <Stat label={t.pendingApproval} value={pending} note={language === 'en' ? 'Needs review' : 'ต้องตรวจสอบ'} />
        <Stat label={t.equipmentInUse} value={inUse} note={language === 'en' ? 'assets' : 'เครื่อง'} />
        <Stat label={t.maintenance} value={maintenance} note={language === 'en' ? 'assets' : 'เครื่อง'} />
      </section>

      <section className="dashboard-grid">
        <div className="panel analytics-panel">
          <div className="panel-head">
            <h2>{language === 'en' ? 'Ticket Status Overview' : 'ภาพรวมสถานะ Ticket'}</h2>
          </div>
          <div className="status-bars">
            {statusCounts.map((status) => (
              <div key={status.label}>
                <div className="status-bar-label">
                  <span>{status.label}</span>
                  <strong>{status.count}</strong>
                </div>
                <div className="status-bar-track">
                  <i style={{ width: `${(status.count / maxStatus) * 100}%`, background: status.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel analytics-panel">
          <div className="panel-head">
            <h2>{language === 'en' ? 'Usage by Category' : 'ยอดใช้ตามหมวดหมู่'}</h2>
          </div>
          <div className="category-bars">
            {topCategories.length ? (
              topCategories.map(([category, count]) => (
                <div key={category}>
                  <div className="category-bar-label">
                    <span>{category}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="category-bar-track">
                    <i style={{ width: `${(count / maxCategory) * 100}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">ยังไม่มีข้อมูล</p>
            )}
          </div>
        </div>
      </section>

      <section className="dashboard-panels">
        <div className="panel asset-age-panel">
          <div className="panel-head">
              <h2>{language === 'en' ? 'Assets in use for 4+ years' : 'อุปกรณ์ใช้งานครบ 4 ปีขึ้นไป'}</h2>
            <span className="panel-total">{filteredFourYearAssets.length} เครื่อง</span>
          </div>
          <div className="filters asset-age-filters">
            <label className="search">
              <Search size={16} />
              <input value={assetAgeQuery} onChange={(event) => { setAssetAgeQuery(event.target.value); setAssetAgePage(1); }} placeholder={language === 'en' ? 'Search ID, asset, serial, or branch' : 'ค้นหา ID, อุปกรณ์, Serial หรือสาขา'} />
            </label>
          </div>
          <div className="table-wrap">
            <table className="dashboard-table asset-age-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{language === 'en' ? 'Name' : 'ชื่อ'}</th>
                  <th>{language === 'en' ? 'Branch' : 'สาขา'}</th>
                  <th>{language === 'en' ? 'In use since' : 'เริ่มใช้'}</th>
                  <th>{language === 'en' ? 'Age' : 'อายุ'}</th>
                </tr>
              </thead>
              <tbody>
                {visibleFourYearAssets.length ? visibleFourYearAssets.map(({ asset, usageMonths }) => {
                  const location = normalizeLocationEntry(asset.location);
                  const branchName = location.shortName ? `${location.id} - ${location.shortName}` : asset.location;
                  return (
                    <tr key={asset.id}>
                      <td><b className="ticket-id">{asset.id}</b></td>
                      <td>{asset.assetName}</td>
                      <td>{branchName}</td>
                      <td>{new Date(`${asset.installationDate || asset.purchaseDate}T00:00:00`).toLocaleDateString('th-TH-u-ca-gregory', { year: 'numeric', month: 'short', day: '2-digit' })}</td>
                      <td><b className="asset-age-value">{formatAssetUsageDuration(usageMonths, language)}</b></td>
                    </tr>
                  );
                }) : (
                  <tr><td className="empty-location-row" colSpan={5}>{fourYearAssets.length ? (language === 'en' ? 'No assets match your search' : 'ไม่พบอุปกรณ์ที่ตรงกับคำค้นหา') : (language === 'en' ? 'No assets have reached 4 years of use' : 'ยังไม่มีอุปกรณ์ที่ใช้งานครบ 4 ปี')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredFourYearAssets.length > assetAgePageSize && (
            <div className="table-pagination">
              <button type="button" className="icon-button" aria-label="หน้าก่อนหน้า" title="หน้าก่อนหน้า" disabled={activeAssetAgePage === 1} onClick={() => setAssetAgePage(activeAssetAgePage - 1)}><ChevronLeft size={16} /></button>
              <span>{language === 'en' ? `Page ${activeAssetAgePage} of ${assetAgePageCount}` : `หน้า ${activeAssetAgePage} จาก ${assetAgePageCount}`}</span>
              <button type="button" className="icon-button" aria-label="หน้าถัดไป" title="หน้าถัดไป" disabled={activeAssetAgePage === assetAgePageCount} onClick={() => setAssetAgePage(activeAssetAgePage + 1)}><ChevronRight size={16} /></button>
            </div>
          )}
        </div>

        <div className="panel branch-budget-panel">
          <div className="panel-head">
            <h2>{language === 'en' ? 'Spending by Branch' : 'ยอดใช้จ่ายรายสาขา'}</h2>
            <span className="panel-total">THB</span>
          </div>
          <div className="branch-budget-list">
            {branchSpend.length ? branchSpend.map(({ location, assetCount, spent, spentUsd }) => (
              <div className="branch-budget" key={`${location.id}-${location.shortName}`}>
                <strong>{formatLocationLabel(location)}</strong>
                <span>{language === 'en' ? `${assetCount} assets` : `จำนวนอุปกรณ์ ${assetCount} เครื่อง`}</span>
                <b className="branch-spending">{language === 'en' ? 'Total spent' : 'ใช้จ่ายรวม'} {spent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB</b>
                <b className="branch-spending-usd">{language === 'en' ? 'Total spent' : 'ใช้จ่ายรวม'} ${spentUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</b>
              </div>
            )) : (
              <p className="empty-state">{language === 'en' ? 'No asset price data' : 'ยังไม่มีข้อมูลราคาอุปกรณ์'}</p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>{language === 'en' ? 'Ticket Management KPI' : 'KPI การจัดการ Ticket'}</h2>
          </div>
          <div className="report-list">
            <p>
              {language === 'en' ? 'Completion rate' : 'อัตราปิดงาน'} <b>{completionRate}%</b>
            </p>
            <p>
              {language === 'en' ? 'Active tickets' : 'งานที่กำลังดำเนินการ'} <b>{openTickets}</b>
            </p>
            <p>
              {language === 'en' ? 'Approval rate' : 'อัตราอนุมัติ'} <b>{approvalRate}%</b>
            </p>
            <p>
              {language === 'en' ? 'Average resolution time' : 'เวลาแก้ไขเฉลี่ย'} <b>{averageResolutionMinutes === null ? '-' : formatResolutionDuration(new Date(0).toISOString(), new Date(averageResolutionMinutes * 60000).toISOString(), language)}</b>
            </p>
          </div>
          <div className="assignee-kpi-section">
            <h3>{language === 'en' ? 'Assignees' : 'ผู้รับผิดชอบงาน'}</h3>
            <div className="assignee-kpi-list">
              {assigneeKpis.length ? assigneeKpis.map(([assignee, kpi]) => (
                <div className="assignee-kpi" key={assignee}>
                  <strong>{assignee}</strong>
                  <span>{language === 'en' ? `Total ${kpi.total} | Closed ${kpi.completed} | Active ${kpi.open}` : `ทั้งหมด ${kpi.total} | ปิดแล้ว ${kpi.completed} | ดำเนินการ ${kpi.open}`}</span>
                  <b>{Math.round((kpi.completed / kpi.total) * 100)}%</b>
                </div>
              )) : (
                <p className="empty-state">{language === 'en' ? 'No tickets yet' : 'ยังไม่มี Ticket'}</p>
              )}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>{language === 'en' ? 'Asset Summary' : 'สรุปอุปกรณ์'}</h2>
          </div>
          <div className="report-list">
            <p>
              {language === 'en' ? 'Available' : 'พร้อมใช้งาน'} <b>{available}</b>
            </p>
            <p>
              {language === 'en' ? 'In use' : 'กำลังใช้งาน'} <b>{inUse}</b>
            </p>
            <p>
              {language === 'en' ? 'Needs service' : 'รอซ่อม/ตรวจสอบ'} <b>{maintenance}</b>
            </p>
            <p>
              {language === 'en' ? 'Total' : 'รวมทั้งหมด'} <b>{assets.length}</b>
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>{language === 'en' ? 'Recent Tickets' : 'Ticket ล่าสุด'}</h2>
          </div>
          <div className="recent-list">
            {tickets.slice(0, 4).map((ticket) => (
              <div className="recent-ticket" key={ticket.id}>
                <span className="recent-ticket-icon" style={{ background: ticket.status === 'Completed' ? '#2b9f7d' : ticket.status === 'In Progress' ? '#2d8aa8' : '#c4a15b' }}>
                  {ticket.storeName.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>#{ticket.id}</strong>
                  <span>{ticket.storeName}</span>
                </div>
                <small>{ticket.status}</small>
              </div>
            ))}
            {!tickets.length && <p className="empty-state">{language === 'en' ? 'No tickets yet' : 'ยังไม่มี Ticket'}</p>}
          </div>
        </div>
      </section>
    </>
  );
}

function AssetView({ assets, language, onAdd, onEdit, onDelete }: { assets: Asset[]; language: Language; onAdd: () => void; onEdit: (asset: Asset) => void; onDelete: (asset: Asset) => void }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredAssets = normalizedQuery
    ? assets.filter((asset) => [asset.id, asset.assetName, asset.category, asset.serialNumber, asset.location, asset.owner, asset.status, asset.vendor ?? ''].some((value) => value.toLowerCase().includes(normalizedQuery)))
    : assets;
  const groupedByLocation = filteredAssets.reduce<Record<string, Asset[]>>((result, asset) => {
    result[asset.location] = [...(result[asset.location] ?? []), asset];
    return result;
  }, {});

  return (
    <section className="panel asset-inventory-panel">
      <div className="panel-head">
        <h2>{language === 'en' ? 'Asset Inventory' : 'จัดเก็บอุปกรณ์'}</h2>
        <button className="primary" onClick={onAdd}>
          <Plus size={16} /> {language === 'en' ? 'Add Asset' : 'เพิ่มอุปกรณ์'}
        </button>
      </div>

      <div className="filters">
        <label className="search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === 'en' ? 'Search ID, asset, serial, branch, or vendor' : 'ค้นหา ID, อุปกรณ์, Serial, สาขา หรือผู้จำหน่าย'} />
        </label>
      </div>

      <div className="table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{language === 'en' ? 'Asset Name' : 'ชื่ออุปกรณ์'}</th>
              <th>{language === 'en' ? 'Type' : 'ประเภท'}</th>
              <th>Serial</th>
              <th>{language === 'en' ? 'Location' : 'สถานที่'}</th>
              <th>{language === 'en' ? 'Owner' : 'เจ้าของ'}</th>
              <th>{language === 'en' ? 'Status' : 'สถานะ'}</th>
              <th>{language === 'en' ? 'Purchase Date' : 'วันที่ซื้อ'}</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.length ? filteredAssets.map((asset, index) => (
              <tr key={`${asset.id}-${asset.serialNumber}-${asset.location}-${index}`}>
                <td>
                  <b className="ticket-id">{asset.id}</b>
                </td>
                <td>{asset.assetName}</td>
                <td>{asset.category}</td>
                <td>{asset.serialNumber}</td>
                <td>{asset.location}</td>
                <td>{asset.owner}</td>
                <td>
                  <span className={`badge ${asset.status === 'In Use' ? 'approved' : asset.status === 'Available' ? 'waiting' : 'rejected'}`}>
                    {asset.status}
                  </span>
                </td>
                <td>
                  <div className="actions">
                      <button className="icon-button" title={language === 'en' ? 'Edit' : 'แก้ไข'} onClick={() => onEdit(asset)}>
                      <Pencil size={14} />
                    </button>
                    <button className="icon-button reject" title={language === 'en' ? 'Delete asset' : 'ลบอุปกรณ์'} onClick={() => onDelete(asset)}>
                      <Trash2 size={14} />
                    </button>
                    {asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString('th-TH-u-ca-gregory') : '-'}
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td className="empty-location-row" colSpan={8}>{language === 'en' ? 'No assets match your search' : 'ไม่พบอุปกรณ์ที่ตรงกับคำค้นหา'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="dashboard-panels" style={{ marginTop: 18 }}>
        {Object.entries(groupedByLocation).map(([location, items]) => (
          <div className="panel" key={location}>
            <div className="panel-head">
              <h2>{location}</h2>
            </div>
            <div className="report-list">
              {items.map((item) => (
                <p key={item.id}>
                  {item.assetName} <b>{item.status}</b>
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Login({ onLogin }: { onLogin: (staffId: string) => void }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);

  return (
    <div className="login">
      <form
        className="login-box"
        onSubmit={(event) => {
          event.preventDefault();
          if ((id === '7748' && password === '6081') || (id === 'IT02' && password === '456')) onLogin(id);
          else setFailed(true);
        }}
      >
        <span className="mark">OD</span>
        <h1>Ticket Control</h1>
        <p>OWNDAYS IT Management</p>
        <label>
          Staff ID
          <input value={id} onChange={(event) => setId(event.target.value)} placeholder={activeLanguage === 'en' ? 'e.g. 7748' : 'เช่น 7748'} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button className="primary">{activeLanguage === 'en' ? 'Log in' : 'เข้าสู่ระบบ'}</button>
        {failed && <small className="error">{activeLanguage === 'en' ? 'Invalid Staff ID or password' : 'Staff ID หรือรหัสผ่านไม่ถูกต้อง'}</small>}
      </form>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function TicketRow({ ticket, users, language, isAdmin, onEdit, onApprove, onStatusChange, onViewAttachments }: { ticket: Ticket; users: User[]; language: Language; isAdmin: boolean; onEdit: () => void; onApprove: (decision: 'Approved' | 'Rejected') => void; onStatusChange: (status: Ticket['status']) => void; onViewAttachments?: (ticket: Ticket) => void }) {
  const assigneeName = users.find((user) => user.staffId === ticket.assignee)?.name ?? ticket.assignee;

  return (
    <tr>
      <td>
        <b className="ticket-id">#{ticket.id}</b>
        <small>
          {language === 'en' ? 'Created:' : 'สร้าง:'} {new Date(ticket.createdAt).toLocaleDateString('th-TH-u-ca-gregory', { year: 'numeric', month: 'short', day: '2-digit' })}
          {ticket.createdAt && ' ' + new Date(ticket.createdAt).toLocaleTimeString('th-TH-u-ca-gregory', { hour: '2-digit', minute: '2-digit' })}
          {ticket.completedAt && <><br />{language === 'en' ? 'Completed:' : 'ปิด:'} {new Date(ticket.completedAt).toLocaleDateString('th-TH-u-ca-gregory', { year: 'numeric', month: 'short', day: '2-digit' })} {new Date(ticket.completedAt).toLocaleTimeString('th-TH-u-ca-gregory', { hour: '2-digit', minute: '2-digit' })}</>}
          {ticket.attachments && ticket.attachments.length > 0 && <><br /><span className="attachment-indicator">📎 {ticket.attachments.length} {language === 'en' ? 'files' : 'ไฟล์'}</span></>}
        </small>
      </td>
      <td>{ticket.storeName}</td>
      <td>{ticket.category}</td>
      <td className="desc">{ticket.description}</td>
      <td>{assigneeName}</td>
      <td>
        <span className={`badge ${ticket.status.toLowerCase().replace(' ', '-')}`}>{ticket.status}</span>
      </td>
      <td>
        <span className={`badge ${ticket.approval ? ticket.approval.toLowerCase() : 'waiting'}`}>
          {ticket.approval === 'Approved' ? (language === 'en' ? 'Approved' : 'อนุมัติแล้ว') : ticket.approval === 'Rejected' ? (language === 'en' ? 'Rejected' : 'ไม่อนุมัติ') : (language === 'en' ? 'Pending review' : 'รอตรวจสอบ')}
        </span>
      </td>
      <td>
        <div className="actions">
          <select
            className="status-select"
            aria-label={`เปลี่ยนสถานะ Ticket ${ticket.id}`}
            value={ticket.status}
            onChange={(event) => onStatusChange(event.target.value as Ticket['status'])}
          >
            <option value="Pending">{language === 'en' ? 'Pending' : 'รอดำเนินการ'}</option>
            <option value="In Progress">{language === 'en' ? 'In progress' : 'กำลังดำเนินการ'}</option>
            <option value="Completed">{language === 'en' ? 'Completed' : 'เสร็จสิ้น'}</option>
            <option value="Rejected">{language === 'en' ? 'Rejected' : 'ยกเลิก'}</option>
          </select>
          {ticket.attachments && ticket.attachments.length > 0 && (
            <button className="icon-button" title="ดูไฟล์แนบ" onClick={() => onViewAttachments?.(ticket)}>
              📎
            </button>
          )}
          <button className="icon-button" title="แก้ไข" onClick={onEdit}>
            <Pencil size={14} />
          </button>
          {isAdmin && !ticket.approval && (
            <>
              <button className="icon-button approve" title="อนุมัติ" onClick={() => onApprove('Approved')}>
                <Check size={14} />
              </button>
              <button className="icon-button reject" title="ไม่อนุมัติ" onClick={() => onApprove('Rejected')}>
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function AdminView({
  users,
  language,
  masterData,
  setMasterData,
  onAddUser,
  onEditUser,
}: {
  users: User[];
  language: Language;
  masterData: MasterData;
  setMasterData: (data: MasterData) => void;
  onAddUser: () => void;
  onEditUser: (user: User) => void;
}) {
  const [categoryInput, setCategoryInput] = useState('');
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [assetTypeInput, setAssetTypeInput] = useState('');
  const [editingAssetTypeKey, setEditingAssetTypeKey] = useState<string | null>(null);
  const [locationIdInput, setLocationIdInput] = useState('');
  const [locationShortNameInput, setLocationShortNameInput] = useState('');
  const [locationFullNameInput, setLocationFullNameInput] = useState('');
  const [locationBudgetInput, setLocationBudgetInput] = useState('');
  const [editingLocationKey, setEditingLocationKey] = useState<string | null>(null);
  const [vendorInput, setVendorInput] = useState('');
  const [editingVendorKey, setEditingVendorKey] = useState<string | null>(null);

  const sortList = (items: string[]) => [...items].sort((a, b) => a.localeCompare(b, 'th', { sensitivity: 'base' }));
  const sortLocationList = (items: LocationMasterItem[]) => [...items].sort((a, b) => formatLocationLabel(a).localeCompare(formatLocationLabel(b), 'th', { sensitivity: 'base' }));

  const resetLocationForm = () => {
    setLocationIdInput('');
    setLocationShortNameInput('');
    setLocationFullNameInput('');
    setLocationBudgetInput('');
    setEditingLocationKey(null);
  };

  const addCategoryItem = () => {
    const normalized = categoryInput.trim().toUpperCase();
    if (!normalized) return;

    const nextCategories = editingCategoryKey
      ? masterData.categories.map((item) => (item === editingCategoryKey ? normalized : item))
      : [...masterData.categories, normalized];

    setMasterData({
      ...masterData,
      categories: sortList(nextCategories),
      vendors: sortList(masterData.vendors),
      locations: sortLocationList(masterData.locations),
    });
    setCategoryInput('');
    setEditingCategoryKey(null);
  };

  const removeCategoryItem = (value: string) => {
    setMasterData({
      ...masterData,
      categories: masterData.categories.filter((item) => item !== value),
    });
    if (editingCategoryKey === value) {
      setCategoryInput('');
      setEditingCategoryKey(null);
    }
  };

  const beginEditCategory = (value: string) => {
    setCategoryInput(value);
    setEditingCategoryKey(value);
  };

  const addAssetTypeItem = () => {
    const normalized = assetTypeInput.trim().toUpperCase();
    if (!normalized) return;

    const nextAssetTypes = editingAssetTypeKey
      ? masterData.assetTypes.map((item) => (item === editingAssetTypeKey ? normalized : item))
      : [...masterData.assetTypes, normalized];

    setMasterData({ ...masterData, assetTypes: sortList([...new Set(nextAssetTypes)]) });
    setAssetTypeInput('');
    setEditingAssetTypeKey(null);
  };

  const removeAssetTypeItem = (value: string) => {
    setMasterData({ ...masterData, assetTypes: masterData.assetTypes.filter((item) => item !== value) });
    if (editingAssetTypeKey === value) {
      setAssetTypeInput('');
      setEditingAssetTypeKey(null);
    }
  };

  const beginEditAssetType = (value: string) => {
    setAssetTypeInput(value);
    setEditingAssetTypeKey(value);
  };

  const addVendorItem = () => {
    const normalized = vendorInput.trim().toUpperCase();
    if (!normalized) return;

    const nextVendors = editingVendorKey
      ? masterData.vendors.map((item) => (item === editingVendorKey ? normalized : item))
      : [...masterData.vendors, normalized];

    setMasterData({
      ...masterData,
      categories: sortList(masterData.categories),
      vendors: sortList(nextVendors),
      locations: sortLocationList(masterData.locations),
    });
    setVendorInput('');
    setEditingVendorKey(null);
  };

  const removeVendorItem = (value: string) => {
    setMasterData({
      ...masterData,
      vendors: masterData.vendors.filter((item) => item !== value),
    });
    if (editingVendorKey === value) {
      setVendorInput('');
      setEditingVendorKey(null);
    }
  };

  const beginEditVendor = (value: string) => {
    setVendorInput(value);
    setEditingVendorKey(value);
  };

  const addMasterItem = (key: 'categories' | 'vendor' | 'locations', value: string) => {
    if (!value.trim()) return;
    const normalized = value.trim();
    const nextCategories = key === 'categories' ? sortList([...new Set([...masterData.categories, normalized])]) : sortList(masterData.categories);
    const nextVendors = key === 'vendor' ? sortList([...new Set([...masterData.vendors, normalized])]) : sortList(masterData.vendors);

    if (key === 'locations') {
      const item: LocationMasterItem = {
        id: locationIdInput.trim(),
        shortName: locationShortNameInput.trim(),
        fullName: locationFullNameInput.trim(),
        budget: locationBudgetInput === '' ? undefined : Number(locationBudgetInput.replace(/,/g, '')),
      };
      if (!item.id && !item.shortName && !item.fullName) return;

      const duplicateLocation = masterData.locations.some((entry) => locationIdentity(entry) === locationIdentity(item) && locationIdentity(entry) !== editingLocationKey);
      if (duplicateLocation) return;

      const nextLocations = editingLocationKey
        ? masterData.locations.map((entry) => {
        const entryKey = locationIdentity(entry);
            return entryKey === editingLocationKey ? item : entry;
          })
        : [...masterData.locations, item];

      setMasterData({
        ...masterData,
        categories: nextCategories,
        vendors: nextVendors,
        locations: sortLocationList(nextLocations),
      });
      resetLocationForm();
    } else {
      setMasterData({
        ...masterData,
        categories: nextCategories,
        vendors: nextVendors,
        locations: sortLocationList(masterData.locations),
      });
    }
    setCategoryInput('');
    setVendorInput('');
  };

  const removeLocationItem = (item: LocationMasterItem) => {
    const key = locationIdentity(item);
    setMasterData({
      ...masterData,
      locations: masterData.locations.filter((entry) => locationIdentity(entry) !== key),
    });
    if (editingLocationKey === key) resetLocationForm();
  };

  const beginEditLocation = (item: LocationMasterItem) => {
    setLocationIdInput(item.id);
    setLocationShortNameInput(item.shortName);
    setLocationFullNameInput(item.fullName);
    setLocationBudgetInput(item.budget === undefined ? '' : item.budget.toLocaleString('en-US', { maximumFractionDigits: 2 }));
    setEditingLocationKey(locationIdentity(item));
  };

  const categoryItems = sortList(masterData.categories);
  const assetTypeItems = sortList(masterData.assetTypes);
  const vendorItems = sortList(masterData.vendors);
  const locationItems = sortLocationList(masterData.locations);

  return (
    <section className="panel admin-master-panel">
      <div className="panel-head">
        <h2>{language === 'en' ? 'Administrator' : 'ผู้ดูแลระบบ'}</h2>
      </div>

      <div className="admin-layout">
        <div className="panel admin-users-panel">
          <div className="panel-head">
            <h2>{language === 'en' ? 'Users' : 'รายชื่อผู้ใช้งาน'}</h2>
            <button className="primary" onClick={onAddUser}>
              <Plus size={16} /> {language === 'en' ? 'Add user' : 'เพิ่มรายชื่อ'}
            </button>
          </div>
          <div className="admin-user-list">
            {users.length ? (
              users.map((user) => (
                <div className="admin-user" key={user.staffId}>
                  <div>
                    <strong>{user.name}</strong>
                    <span>Staff ID: {user.staffId}</span>
                  </div>
                  <div className="permission-chips">
                    {Object.entries(user.permissions)
                      .filter(([, value]) => value)
                      .map(([key]) => (
                        <span key={`${user.staffId}-${key}`}>{key}</span>
                      ))}
                    {user.name === 'Tanakit Lertmana' && <span>super admin</span>}
                  </div>
                  <button className="icon-button admin-edit-button" title="แก้ไข" onClick={() => onEditUser(user)}>
                    <Pencil size={14} />
                  </button>
                </div>
              ))
            ) : (
              <p className="empty-state">{language === 'en' ? 'No users yet' : 'ยังไม่มีข้อมูลผู้ใช้งาน'}</p>
            )}
          </div>
        </div>

        <div className="panel admin-form-panel">
          <div className="panel-head">
            <h2>{language === 'en' ? 'Master Data' : 'จัดการข้อมูลหลัก'}</h2>
          </div>

          <div className="master-data-sections">
            <div className="master-data-section">
              <div className="master-data-header">
                <div>
                  <h3>Category</h3>
                  <small>{language === 'en' ? 'Ticket category' : 'ประเภทอุปกรณ์'}</small>
                </div>
                <span className="master-data-count">{masterData.categories.length}</span>
              </div>
              <div className="inline-form">
                <input value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} placeholder={language === 'en' ? 'Add category' : 'เพิ่ม category'} />
                <button className="primary" onClick={addCategoryItem}>{editingCategoryKey ? (language === 'en' ? 'Save' : 'บันทึก') : (language === 'en' ? 'Add' : 'เพิ่ม')}</button>
              </div>
              {masterData.categories.length ? (
                <div className="permission-chips category-tags">
                  {categoryItems.map((item) => (
                    <div key={item} className="master-tag-item">
                      <span>{item}</span>
                      <div className="master-tag-actions">
                        <button type="button" className="icon-button" title="แก้ไข" onClick={() => beginEditCategory(item)}>
                          <Pencil size={12} />
                        </button>
                        <button type="button" className="icon-button reject" title="ลบ" onClick={() => removeCategoryItem(item)}>
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-mini">{language === 'en' ? 'No data yet' : 'ยังไม่มีข้อมูล'}</p>
              )}
            </div>

            <div className="master-data-section">
              <div className="master-data-header">
                <div>
                  <h3>Asset Type</h3>
                  <small>{language === 'en' ? 'Equipment types for asset inventory' : 'ประเภทอุปกรณ์สำหรับทะเบียนทรัพย์สิน'}</small>
                </div>
                <span className="master-data-count">{masterData.assetTypes.length}</span>
              </div>
              <div className="inline-form">
                <input value={assetTypeInput} onChange={(event) => setAssetTypeInput(event.target.value)} placeholder={language === 'en' ? 'Add asset type' : 'เพิ่มประเภทอุปกรณ์'} />
                <button className="primary" onClick={addAssetTypeItem}>{editingAssetTypeKey ? (language === 'en' ? 'Save' : 'บันทึก') : (language === 'en' ? 'Add' : 'เพิ่ม')}</button>
              </div>
              {masterData.assetTypes.length ? (
                <div className="permission-chips category-tags">
                  {assetTypeItems.map((item) => (
                    <div key={item} className="master-tag-item">
                      <span>{item}</span>
                      <div className="master-tag-actions">
                        <button type="button" className="icon-button" title="แก้ไข" onClick={() => beginEditAssetType(item)}><Pencil size={12} /></button>
                        <button type="button" className="icon-button reject" title="ลบ" onClick={() => removeAssetTypeItem(item)}><X size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-mini">ยังไม่มีข้อมูล</p>
              )}
            </div>

            <div className="master-data-section">
              <div className="master-data-header">
                <div>
                  <h3>Vendor</h3>
                  <small>{language === 'en' ? 'Supplier' : 'ผู้จำหน่าย'}</small>
                </div>
                <span className="master-data-count">{masterData.vendors.length}</span>
              </div>
              <div className="inline-form">
                <input value={vendorInput} onChange={(event) => setVendorInput(event.target.value)} placeholder={language === 'en' ? 'Add vendor' : 'เพิ่ม vendor'} />
                <button className="primary" onClick={addVendorItem}>{editingVendorKey ? (language === 'en' ? 'Save' : 'บันทึก') : (language === 'en' ? 'Add' : 'เพิ่ม')}</button>
              </div>
              {masterData.vendors.length ? (
                <div className="permission-chips category-tags">
                  {vendorItems.map((item) => (
                    <div key={item} className="master-tag-item">
                      <span>{item}</span>
                      <div className="master-tag-actions">
                        <button type="button" className="icon-button" title="แก้ไข" onClick={() => beginEditVendor(item)}>
                          <Pencil size={12} />
                        </button>
                        <button type="button" className="icon-button reject" title="ลบ" onClick={() => removeVendorItem(item)}>
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-mini">ยังไม่มีข้อมูล</p>
              )}
            </div>

            <div className="master-data-section">
              <div className="master-data-header">
                <div>
                  <h3>Location</h3>
                  <small>{language === 'en' ? 'Branch / Location' : 'สาขา / สถานที่'}</small>
                </div>
                <span className="master-data-count">{masterData.locations.length}</span>
              </div>
              <div className="location-inputs">
                <input value={locationIdInput} onChange={(event) => setLocationIdInput(event.target.value)} placeholder="ไอดี เช่น HQ / 201" />
                <input value={locationShortNameInput} onChange={(event) => setLocationShortNameInput(event.target.value)} placeholder="ชื่อย่อ เช่น สำนักงานใหญ่ / MGB" />
                <input value={locationFullNameInput} onChange={(event) => setLocationFullNameInput(event.target.value)} placeholder="ชื่อเต็ม เช่น Head Office / Mega Bangna" />
                <input inputMode="decimal" value={locationBudgetInput} onChange={(event) => {
                  const rawValue = event.target.value.replace(/,/g, '');
                  if (rawValue === '' || (Number.isFinite(Number(rawValue)) && Number(rawValue) >= 0)) setLocationBudgetInput(rawValue === '' ? '' : Number(rawValue).toLocaleString('en-US', { maximumFractionDigits: 2 }));
                }} placeholder="งบประมาณ (THB)" />
                <div className="location-action-row">
                  <button className="primary" onClick={() => addMasterItem('locations', `${locationIdInput} - ${locationShortNameInput}`)}>
                    {editingLocationKey ? 'บันทึกแก้ไข' : 'เพิ่ม'}
                  </button>
                  {editingLocationKey && (
                    <button type="button" className="ghost" onClick={resetLocationForm}>ยกเลิก</button>
                  )}
                </div>
              </div>
              {masterData.locations.length ? (
                <div className="permission-chips location-tags">
                  {locationItems.map((item) => {
                    const key = locationIdentity(item);
                    return (
                      <div key={key} className="location-tag-item">
                        <span>{formatLocationLabel(item)}</span>
                        <div className="location-tag-actions">
                          <button type="button" className="icon-button" title="แก้ไข" onClick={() => beginEditLocation(item)}>
                            <Pencil size={12} />
                          </button>
                          <button type="button" className="icon-button reject" title="ลบ" onClick={() => removeLocationItem(item)}>
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-mini">ยังไม่มีข้อมูล</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

function UserModal({
  form,
  setForm,
  onClose,
  onSubmit,
  editing,
}: {
  form: Partial<User>;
  setForm: (form: Partial<User>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  editing: boolean;
}) {
  const update = (key: keyof User, value: string | UserPermission) => setForm({ ...form, [key]: value });
  const permissions = form.permissions ?? defaultUserPermissions();

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={onSubmit}>
        <div className="modal-head">
          <h2>{editing ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มรายชื่อผู้ใช้งาน'}</h2>
          <button type="button" className="close" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="form-grid">
          <label>
            Staff ID
            <input required value={form.staffId ?? ''} onChange={(event) => update('staffId', event.target.value)} />
          </label>
          <label>
            ชื่อผู้ใช้งาน
            <input required value={form.name ?? ''} onChange={(event) => update('name', event.target.value)} />
          </label>
          <label>
            Password
            <input required type="text" value={form.password ?? ''} onChange={(event) => update('password', event.target.value)} />
          </label>
          <label>
            Role
            <select value={form.role ?? 'user'} onChange={(event) => {
              const role = event.target.value as 'admin' | 'user';
              update('role', role);
              update('permissions', normalizeUserPermissions(role, permissions));
            }}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <div className="full permission-grid">
            <label className="checkbox-row">
              <input type="checkbox" checked={permissions.dashboard} onChange={(event) => update('permissions', { ...permissions, dashboard: event.target.checked })} />
              Dashboard
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={permissions.tickets} onChange={(event) => update('permissions', { ...permissions, tickets: event.target.checked })} />
              Tickets
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={permissions.assets} onChange={(event) => update('permissions', { ...permissions, assets: event.target.checked })} />
              Assets
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={permissions.reports} onChange={(event) => update('permissions', { ...permissions, reports: event.target.checked })} />
              Reports
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={permissions.administrator} onChange={(event) => update('permissions', { ...permissions, administrator: event.target.checked })} />
              Administrator
            </label>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>ยกเลิก</button>
          <button className="primary">บันทึก</button>
        </div>
      </form>
    </div>
  );
}

function AssetModal({
  form,
  setForm,
  onClose,
  onSubmit,
  editing,
  masterData,
  currentUserName,
  assets,
  editingAssetId,
  saving,
}: {
  form: Partial<Asset>;
  setForm: (form: Partial<Asset>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  editing: boolean;
  masterData: MasterData;
  currentUserName: string;
  assets: Asset[];
  editingAssetId?: string;
  saving: boolean;
}) {
  const update = (key: keyof Asset, value: string) => setForm({ ...form, [key]: value });
  const formatThbPrice = (price: number) => price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [priceInput, setPriceInput] = useState(form.priceBeforeVat === undefined ? '' : formatThbPrice(form.priceBeforeVat));
  const priceBeforeVat = Number(priceInput.replace(/,/g, '')) || 0;
  const priceBeforeVatUsd = priceBeforeVat / usdExchangeRate;
  const serialNumber = form.serialNumber?.trim() ?? '';
  const duplicateSerial = serialNumber !== '' && assets.some((asset) => asset.id !== editingAssetId && asset.serialNumber.trim().toLowerCase() === serialNumber.toLowerCase());
  const vendorOptions = [...new Set([...masterData.vendors, ...(form.vendor && !masterData.vendors.includes(form.vendor) ? [form.vendor] : [])])];

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={onSubmit}>
        <div className="modal-head">
          <h2>{editing ? (activeLanguage === 'en' ? 'Edit Asset' : 'แก้ไขอุปกรณ์') : (activeLanguage === 'en' ? 'Add New Asset' : 'เพิ่มอุปกรณ์ใหม่')}</h2>
          <button type="button" className="close" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="form-grid">
          <label>
            {activeLanguage === 'en' ? 'Asset Name' : 'ชื่ออุปกรณ์'}
            <input required value={form.assetName ?? ''} onChange={(event) => update('assetName', event.target.value)} />
          </label>
          <label>
            {activeLanguage === 'en' ? 'Type' : 'ประเภท'}
            <select required value={form.category ?? ''} onChange={(event) => update('category', event.target.value)}>
              <option value="">{activeLanguage === 'en' ? 'Select type' : 'เลือกประเภท'}</option>
              {(masterData.assetTypes.length ? masterData.assetTypes : ['CCTV', 'EDC', 'LAPTOP', 'POS TERMINAL', 'PRINTER']).map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Serial Number
            <input className={duplicateSerial ? 'input-error' : ''} value={form.serialNumber ?? ''} onChange={(event) => update('serialNumber', event.target.value)} />
            {duplicateSerial && <small className="field-error">Serial Number นี้มีอยู่ในระบบแล้ว</small>}
          </label>
          <label>
            {activeLanguage === 'en' ? 'Location' : 'สถานที่'}
            <select value={form.location ?? ''} onChange={(event) => update('location', event.target.value)}>
              <option value="">{activeLanguage === 'en' ? 'Select branch' : 'เลือกสาขา'}</option>
              {(masterData.locations.length ? masterData.locations : ['HQ - สำนักงานใหญ่ (Head Office)', '201 - MGB - Mega Bangna']).map((location) => {
                const normalized = normalizeLocationEntry(location);
                const optionValue = formatLocationLabel(normalized);
                return (
                  <option key={`${normalized.id}-${normalized.shortName}-${normalized.fullName}`} value={optionValue}>
                    {optionValue}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            {activeLanguage === 'en' ? 'Owner' : 'เจ้าของ'}
            <input value={currentUserName} disabled />
          </label>
          <label>
            {activeLanguage === 'en' ? 'Status' : 'สถานะ'}
            <select value={form.status ?? 'In Use'} onChange={(event) => {
              const status = event.target.value as AssetStatus;
              setForm({ ...form, status, replacementAvailability: status === 'Maintenance' ? form.replacementAvailability : undefined, replacementDetails: status === 'Maintenance' ? form.replacementDetails : '' });
            }}>
              <option>In Use</option>
              <option>Available</option>
              <option>Maintenance</option>
            </select>
          </label>
          {form.status === 'Maintenance' && (
            <div className="full replacement-section">
              <span className="form-grid-label">{activeLanguage === 'en' ? 'Is there a replacement device?' : 'มีเครื่องทดแทนหรือไม่'}</span>
              <div className="replacement-options">
                <button type="button" className={`replacement-option ${form.replacementAvailability === 'yes' ? 'selected' : ''}`} onClick={() => setForm({ ...form, replacementAvailability: 'yes' })}>{activeLanguage === 'en' ? 'Yes, replacement available' : 'มีเครื่องทดแทน'}</button>
                <button type="button" className={`replacement-option ${form.replacementAvailability === 'no' ? 'selected' : ''}`} onClick={() => setForm({ ...form, replacementAvailability: 'no', replacementDetails: '' })}>{activeLanguage === 'en' ? 'No replacement' : 'ไม่มีเครื่องทดแทน'}</button>
              </div>
              {form.replacementAvailability === 'yes' && (
                <label className="replacement-details">
                  {activeLanguage === 'en' ? 'Replacement device details' : 'ข้อมูลเครื่องทดแทน'}
                  <input required value={form.replacementDetails ?? ''} placeholder={activeLanguage === 'en' ? 'e.g. model, serial number, asset ID' : 'เช่น รุ่น, Serial Number, รหัสทรัพย์สิน'} onChange={(event) => update('replacementDetails', event.target.value)} />
                </label>
              )}
            </div>
          )}
          <label>
            {activeLanguage === 'en' ? 'Purchase Date' : 'วันที่ซื้อ'}
            <DatePicker value={form.purchaseDate ?? ''} onChange={(value) => update('purchaseDate', value)} />
          </label>
          <label>
            {activeLanguage === 'en' ? 'Installation Date' : 'วันที่ติดตั้ง'}
            <DatePicker value={form.installationDate ?? ''} onChange={(value) => update('installationDate', value)} />
          </label>
          <label className="full">
            {activeLanguage === 'en' ? 'Vendor' : 'ผู้จำหน่าย'}
            <select value={form.vendor ?? ''} onChange={(event) => update('vendor', event.target.value)}>
              <option value="">{activeLanguage === 'en' ? 'Select vendor' : 'เลือกผู้จำหน่าย'}</option>
              {vendorOptions.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}
            </select>
          </label>
          <label>
            {activeLanguage === 'en' ? 'Price before VAT (THB)' : 'ราคาก่อน VAT (THB)'}
            <input type="text" inputMode="decimal" value={priceInput} onFocus={() => setPriceInput((value) => value.replace(/,/g, ''))} onChange={(event) => {
              const rawValue = event.target.value.replace(/,/g, '');
              if (!/^\d*(\.\d{0,2})?$/.test(rawValue)) return;
              setPriceInput(rawValue);
              if (rawValue === '') {
                setForm({ ...form, priceBeforeVat: undefined });
                return;
              }
              const price = Number(rawValue);
              if (Number.isFinite(price) && price >= 0) setForm({ ...form, priceBeforeVat: price });
            }} onBlur={() => {
              const price = Number(priceInput.replace(/,/g, ''));
              if (Number.isFinite(price) && price >= 0 && priceInput !== '') setPriceInput(formatThbPrice(price));
            }} />
          </label>
          <label>
            {activeLanguage === 'en' ? 'Price before VAT (USD)' : 'ราคาก่อน VAT (USD)'}
            <input value={priceBeforeVat ? `$${priceBeforeVatUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''} placeholder={`คำนวณที่ 1 USD = ${usdExchangeRate} THB`} disabled />
          </label>
          <label className="full">
            {activeLanguage === 'en' ? 'Notes' : 'หมายเหตุ'}
            <textarea rows={3} value={form.remark ?? ''} onChange={(event) => update('remark', event.target.value)} />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>{activeLanguage === 'en' ? 'Cancel' : 'ยกเลิก'}</button>
          <button className="primary" disabled={duplicateSerial || saving}>{saving ? (activeLanguage === 'en' ? 'Saving...' : 'กำลังบันทึก...') : (activeLanguage === 'en' ? 'Save' : 'บันทึก')}</button>
        </div>
      </form>
    </div>
  );
}

function DatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selectedDate = value ? new Date(`${value}T00:00:00`) : new Date();
  const [isOpen, setIsOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(selectedDate.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(selectedDate.getMonth());
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const years = Array.from({ length: 27 }, (_, index) => new Date().getFullYear() - 20 + index);
  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
  const firstDay = new Date(displayYear, displayMonth, 1).getDay();
  const selectedDay = value && selectedDate.getFullYear() === displayYear && selectedDate.getMonth() === displayMonth ? selectedDate.getDate() : 0;
  const formattedDate = value ? selectedDate.toLocaleDateString('th-TH-u-ca-gregory', { year: 'numeric', month: 'short', day: '2-digit' }) : (activeLanguage === 'en' ? 'Select date' : 'เลือกวันเดือนปี');

  const selectDay = (day: number) => {
    onChange(`${displayYear}-${String(displayMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    setIsOpen(false);
  };

  return (
    <div className="date-picker-control">
      <button type="button" className="date-picker-trigger" onClick={() => setIsOpen((open) => !open)}>
        <Calendar size={17} /> {formattedDate}
      </button>
      {isOpen && (
        <div className="calendar-popover">
          <div className="calendar-selectors">
            <select value={displayMonth} onChange={(event) => setDisplayMonth(Number(event.target.value))} aria-label={activeLanguage === 'en' ? 'Month' : 'เดือน'}>
              {months.map((month, index) => <option key={month} value={index}>{month}</option>)}
            </select>
            <select value={displayYear} onChange={(event) => setDisplayYear(Number(event.target.value))} aria-label={activeLanguage === 'en' ? 'Year' : 'ปี'}>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <div className="calendar-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid">
            {Array.from({ length: firstDay }, (_, index) => <span key={`empty-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
              <button type="button" key={day} className={`calendar-day ${day === selectedDay ? 'selected' : ''}`} onClick={() => selectDay(day)}>{day}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Reports({ tickets, language, years, period, startDate, endDate, month, year, onPeriodChange, onStartDateChange, onEndDateChange, onMonthChange, onYearChange, onExport }: { tickets: Ticket[]; language: Language; years: string[]; period: ReportPeriod; startDate: string; endDate: string; month: string; year: string; onPeriodChange: (period: ReportPeriod) => void; onStartDateChange: (date: string) => void; onEndDateChange: (date: string) => void; onMonthChange: (month: string) => void; onYearChange: (year: string) => void; onExport: () => void }) {
  const english = language === 'en';
  const months = [
    ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
    ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
    ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
  ];
  const groups = Object.entries(
    tickets.reduce<Record<string, number>>((result, ticket) => {
      result[ticket.category] = (result[ticket.category] ?? 0) + 1;
      return result;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const max = Math.max(...groups.map(([, count]) => count), 1);
  const completedTickets = tickets.filter((ticket) => ticket.completedAt);
  const averageResolutionMinutes = completedTickets.length
    ? Math.floor(completedTickets.reduce((total, ticket) => total + (new Date(ticket.completedAt!).getTime() - new Date(ticket.createdAt).getTime()) / 60000, 0) / completedTickets.length)
    : null;

  return (
    <>
      <section className="panel report-filters-panel">
        <div className="panel-head">
          <h2>{english ? 'Select report period' : 'เลือกระยะเวลารายงาน'}</h2>
          <span className="report-count">{tickets.length} {english ? 'tickets' : 'รายการ'}</span>
        </div>
        <div className="filters report-filters">
          <select value={period} onChange={(event) => onPeriodChange(event.target.value as ReportPeriod)} aria-label="รูปแบบช่วงเวลารายงาน">
            <option value="range">{english ? 'Date range' : 'เลือกช่วงวันที่'}</option>
            <option value="month">{english ? 'Month' : 'เลือกเดือน'}</option>
            <option value="year">{english ? 'Year' : 'เลือกปี'}</option>
          </select>
          {period === 'range' && (
            <>
              <label className="date-filter">{english ? 'From' : 'ตั้งแต่วันที่'}<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => onStartDateChange(event.target.value)} /></label>
              <label className="date-filter">{english ? 'To' : 'ถึงวันที่'}<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => onEndDateChange(event.target.value)} /></label>
            </>
          )}
          {period === 'month' && (
            <>
              <label className="date-filter">Month<select value={month} onChange={(event) => onMonthChange(event.target.value)}><option value="">All months</option>{months.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="date-filter">Year<select value={year} onChange={(event) => onYearChange(event.target.value)}><option value="">All years</option>{years.map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}</option>)}</select></label>
            </>
          )}
          {period === 'year' && <label className="date-filter">Year<select value={year} onChange={(event) => onYearChange(event.target.value)}><option value="">All years</option>{years.map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}</option>)}</select></label>}
        </div>
      </section>

      <section className="report-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>{english ? 'Overview by category' : 'ภาพรวมตามหมวดหมู่'}</h2>
          </div>
          {groups.length ? (
            groups.map(([category, count]) => (
              <div className="bar-row" key={category}>
                <span>{category}</span>
                <div className="bar">
                  <i style={{ width: `${(count / max) * 100}%` }} />
                </div>
                <b>{count}</b>
              </div>
            ))
          ) : (
            <p>{english ? 'No data yet' : 'ยังไม่มีข้อมูล'}</p>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>{english ? 'Status summary' : 'สรุปสถานะ'}</h2>
          </div>
          <div className="report-list">
            <p>
              {english ? 'Pending review' : 'รออนุมัติ'} <b>{tickets.filter((ticket) => !ticket.approval).length}</b>
            </p>
            <p>
              {english ? 'Approved' : 'อนุมัติแล้ว'} <b>{tickets.filter((ticket) => ticket.approval === 'Approved').length}</b>
            </p>
            <p>
              {english ? 'Rejected' : 'ไม่อนุมัติ'} <b>{tickets.filter((ticket) => ticket.approval === 'Rejected').length}</b>
            </p>
            <p>
              {english ? 'Average resolution time' : 'เวลาแก้ไขเฉลี่ย'} <b>{averageResolutionMinutes === null ? '-' : formatResolutionDuration(new Date(0).toISOString(), new Date(averageResolutionMinutes * 60000).toISOString(), language)}</b>
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{english ? 'History' : 'ประวัติทั้งหมด'}</h2>
          <button className="ghost" onClick={onExport}>
            <Download size={15} /> {english ? 'Download CSV' : 'ดาวน์โหลด CSV'}
          </button>
        </div>
        <p className="sub">{english ? `${tickets.length} tickets` : `มี Ticket ทั้งหมด ${tickets.length} รายการ`}</p>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Created</th>
                <th>Completed</th>
                <th>{english ? 'Resolution' : 'เวลาแก้ไข'}</th>
                <th>{english ? 'Branch' : 'สาขา'}</th>
                <th>{english ? 'Category' : 'หมวดหมู่'}</th>
                <th>{english ? 'Description' : 'รายละเอียด'}</th>
                <th>{english ? 'Status' : 'สถานะ'}</th>
                <th>{english ? 'Approval' : 'อนุมัติ'}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length ? tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td><b className="ticket-id">#{ticket.id}</b></td>
                  <td>{new Date(ticket.createdAt).toLocaleString('th-TH-u-ca-gregory', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{ticket.completedAt ? new Date(ticket.completedAt).toLocaleString('th-TH-u-ca-gregory', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td>{formatResolutionDuration(ticket.createdAt, ticket.completedAt, language)}</td>
                  <td>{ticket.storeName}</td>
                  <td>{ticket.category}</td>
                  <td className="desc">{ticket.description}</td>
                  <td><span className={`badge ${ticket.status.toLowerCase().replace(' ', '-')}`}>{ticket.status}</span></td>
                  <td><span className={`badge ${ticket.approval ? ticket.approval.toLowerCase() : 'waiting'}`}>{ticket.approval === 'Approved' ? (english ? 'Approved' : 'อนุมัติแล้ว') : ticket.approval === 'Rejected' ? (english ? 'Rejected' : 'ไม่อนุมัติ') : (english ? 'Pending review' : 'รอตรวจสอบ')}</span></td>
                </tr>
              )) : (
                <tr>
                  <td className="empty-location-row" colSpan={9}>{english ? 'No tickets in the selected period' : 'ไม่พบ Ticket ในช่วงเวลาที่เลือก'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function TicketModal({
  form,
  setForm,
  onClose,
  onSubmit,
  editing,
  masterData,
  currentStaffId,
  attachmentFiles,
  setAttachmentFiles,
  error,
  setError,
}: {
  form: TicketForm;
  setForm: (form: TicketForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  editing: boolean;
  masterData: MasterData;
  currentStaffId: string;
  attachmentFiles: File[];
  setAttachmentFiles: (files: File[]) => void;
  error: string;
  setError: (error: string) => void;
}) {
  const update = (key: keyof TicketForm, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={onSubmit}>
        <div className="modal-head">
          <h2>{editing ? (activeLanguage === 'en' ? 'Edit Ticket' : 'แก้ไข Ticket') : (activeLanguage === 'en' ? 'Create New Ticket' : 'สร้าง Ticket ใหม่')}</h2>
          <button type="button" className="close" onClick={onClose}>
            <X />
          </button>
        </div>
        {error && <div className="error-message" style={{ color: '#e74c3c', padding: '10px', background: '#fadbd8', borderRadius: '4px', margin: '10px', fontSize: '14px' }}>{error}</div>}

        <div className="form-grid">
          <label>
            {activeLanguage === 'en' ? 'Branch / Location' : 'สาขา / สถานที่'}
            <select required value={form.storeName} onChange={(event) => update('storeName', event.target.value)}>
              <option value="">{activeLanguage === 'en' ? 'Select branch' : 'เลือกสาขา'}</option>
              {(masterData.locations.length ? masterData.locations : ['HQ - สำนักงานใหญ่ (Head Office)', '201 - MGB - Mega Bangna']).map((location) => {
                const normalized = normalizeLocationEntry(location);
                const optionValue = formatLocationLabel(normalized);
                return (
                  <option key={`${normalized.id}-${normalized.shortName}-${normalized.fullName}`} value={optionValue}>
                    {optionValue}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            {activeLanguage === 'en' ? 'Category' : 'หมวดหมู่'}
            <select required value={form.category} onChange={(event) => update('category', event.target.value)}>
              <option value="">{activeLanguage === 'en' ? 'Select category' : 'เลือกหมวดหมู่'}</option>
              {(masterData.categories.length ? masterData.categories : ['Front2 POS', 'Printer', 'Internet/WiFi']).map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="full">
            {activeLanguage === 'en' ? 'Problem description' : 'รายละเอียดปัญหา'}
            <textarea required rows={4} value={form.description} onChange={(event) => update('description', event.target.value)} />
          </label>
          <label>
            {activeLanguage === 'en' ? 'Assignee' : 'ผู้รับผิดชอบ'}
            <input disabled value={form.assignee} />
          </label>
          <label>
            สถานะ
            <select value={form.status} onChange={(event) => update('status', event.target.value as Status)}>
              <option>Pending</option>
              <option>In Progress</option>
              <option>Completed</option>
              <option>Rejected</option>
            </select>
          </label>
          <label className="full">
            {activeLanguage === 'en' ? 'Attachments (image, Excel, PDF)' : 'แนบไฟล์ (รูป, Excel, PDF)'}
            <input
              type="file"
              multiple
              accept="image/*,.xlsx,.xls,.pdf"
              onChange={(event) => {
                if (event.target.files) {
                  const files = Array.from(event.target.files);
                  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
                  const maxSize = 50 * 1024 * 1024; // 50 MB max
                  if (totalSize > maxSize) {
                    setError(activeLanguage === 'en' ? `Total file size must not exceed 50 MB (current ${(totalSize / 1024 / 1024).toFixed(2)} MB)` : `ขนาดไฟล์รวมไม่ควรเกิน 50 MB (ปัจจุบัน ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
                    event.target.value = '';
                  } else {
                    setError('');
                    setAttachmentFiles(files);
                  }
                }
              }}
            />
          </label>
          {attachmentFiles.length > 0 && (
            <div className="full attachment-list">
              <small>{activeLanguage === 'en' ? 'Selected files:' : 'ไฟล์ที่เลือก:'}</small>
              <ul>
                {attachmentFiles.map((file) => (
                  <li key={file.name}>
                    <span>{file.name} ({(file.size / 1024).toFixed(2)} KB)</span>
                    <button
                      type="button"
                      className="remove-file"
                      title="ลบไฟล์นี้"
                      onClick={() => setAttachmentFiles(attachmentFiles.filter((f) => f.name !== file.name))}
                    >
                      ลบ
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="primary">บันทึก Ticket</button>
        </div>
      </form>
    </div>
  );
}

function AttachmentModal({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const downloadFile = (attachment: Attachment) => {
    const byteCharacters = atob(attachment.data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: attachment.type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = attachment.name;
    link.click();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-head">
          <h2>ไฟล์แนบ - #{ticket.id}</h2>
          <button type="button" className="close" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="attachment-modal-content">
          {!ticket.attachments || ticket.attachments.length === 0 ? (
            <p>ไม่มีไฟล์แนบ</p>
          ) : (
            <ul className="file-list">
              {ticket.attachments.map((attachment, index) => (
                <li key={index} className="file-item">
                  <span className="file-info">
                    <strong>{attachment.name}</strong>
                    <small>{attachment.type}</small>
                  </span>
                  <button
                    type="button"
                    className="download-button"
                    onClick={() => downloadFile(attachment)}
                  >
                    ดาวน์โหลด
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;

createRoot(document.getElementById('root')!).render(<App />);
