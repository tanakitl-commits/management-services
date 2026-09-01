import { FormEvent, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  Check,
  ClipboardList,
  Download,
  LayoutDashboard,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  Search,
  Warehouse,
  X,
} from 'lucide-react';
import './styles.css';

type Status = 'Pending' | 'In Progress' | 'Completed' | 'Rejected';
type View = 'dashboard' | 'tickets' | 'reports' | 'assets' | 'admin';
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
  remark?: string;
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
};

type MasterData = {
  categories: string[];
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
    return { id: value.trim(), shortName: '', fullName: value.trim() };
  }

  return {
    id: value.id?.trim() ?? '',
    shortName: value.shortName?.trim() ?? '',
    fullName: value.fullName?.trim() ?? '',
  };
};

const formatLocationLabel = (value: string | LocationMasterItem) => {
  const location = normalizeLocationEntry(value);
  if (!location.id && !location.shortName && !location.fullName) return '';
  if (location.shortName && location.fullName) return `${location.id} - ${location.shortName} - ${location.fullName}`;
  if (location.shortName) return `${location.id} - ${location.shortName}`;
  return location.fullName || location.id;
};

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
  const [currentStaffId, setCurrentStaffId] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [masterData, setMasterData] = useState<MasterData>({ categories: [], vendors: [], locations: [] });
  const [view, setView] = useState<View>('dashboard');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [modal, setModal] = useState<Ticket | 'new' | null>(null);
  const [assetModal, setAssetModal] = useState<Asset | 'new' | null>(null);
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
        locations: (data.locations ?? []).map((location) => normalizeLocationEntry(location)),
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
        locations: (saved.locations ?? []).map((location) => normalizeLocationEntry(location)),
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
        body: JSON.stringify({ decision, approvedBy: 'Tanakit Lertmana' }),
      });
      await loadTickets();
    } catch (approveError) {
      setError((approveError as Error).message);
    }
  };

  const exportCsv = () => {
    const csv = [
      'ID,Store,Category,Description,Assignee,Status,Approval,Created,Completed',
      ...tickets.map((ticket) =>
        [ticket.id, ticket.storeName, ticket.category, ticket.description, ticket.assignee, ticket.status, ticket.approval, ticket.createdAt, ticket.completedAt || '-']
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ].join('\n');

    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    link.download = 'ticket-report.csv';
    link.click();
  };

  const openAssetForm = (asset?: Asset) => {
    setAssetForm(
      asset
        ? { ...asset }
        : {
            assetName: '',
            category: '',
            serialNumber: '',
            location: '201 MGB Mega Bangna',
            owner: 'Tanakit Lertmana',
            status: 'In Use',
            purchaseDate: '',
            installationDate: '',
            vendor: '',
            remark: '',
          },
    );
    setAssetModal(asset ?? 'new');
  };

  const saveAsset = (event: FormEvent) => {
    event.preventDefault();
    if (!assetForm.assetName || !assetForm.category || !assetForm.location) return;

    if (assetModal && assetModal !== 'new') {
      setAssets((current) =>
        current.map((asset) =>
          asset.id === assetModal.id
            ? {
                ...asset,
                assetName: assetForm.assetName ?? asset.assetName,
                category: assetForm.category ?? asset.category,
                serialNumber: assetForm.serialNumber ?? asset.serialNumber,
                location: assetForm.location ?? asset.location,
                owner: assetForm.owner ?? asset.owner,
                status: (assetForm.status as AssetStatus) ?? asset.status,
                purchaseDate: assetForm.purchaseDate ?? asset.purchaseDate,
                installationDate: assetForm.installationDate ?? asset.installationDate,
                vendor: assetForm.vendor ?? asset.vendor,
                remark: assetForm.remark ?? asset.remark,
              }
            : asset,
        ),
      );
    } else {
      const nextId = `201-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(assets.length + 1).padStart(3, '0')}`;
      setAssets((current) => [
        {
          id: nextId,
          assetName: assetForm.assetName ?? '',
          category: assetForm.category ?? '',
          serialNumber: assetForm.serialNumber ?? '',
          location: assetForm.location ?? '',
          owner: assetForm.owner ?? 'Tanakit Lertmana',
          status: (assetForm.status as AssetStatus) ?? 'In Use',
          purchaseDate: assetForm.purchaseDate ?? new Date().toISOString().slice(0, 10),
          installationDate: assetForm.installationDate ?? assetForm.purchaseDate ?? new Date().toISOString().slice(0, 10),
          vendor: assetForm.vendor ?? '',
          remark: assetForm.remark ?? '',
          priceBeforeVat: assetForm.priceBeforeVat ?? 0,
        },
        ...current,
      ]);
    }
    setAssetModal(null);
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
        <small className="nav-label">WORKSPACE</small>
        <nav>
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
            <LayoutDashboard size={17} /> Dashboard
          </button>
          <button className={view === 'tickets' ? 'active' : ''} onClick={() => setView('tickets')}>
            <ClipboardList size={17} /> จัดการ Ticket
          </button>
          <button className={view === 'assets' ? 'active' : ''} onClick={() => setView('assets')}>
            <Warehouse size={17} /> จัดเก็บอุปกรณ์
          </button>
          <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>
            <BarChart3 size={17} /> รายงานย้อนหลัง
          </button>
          <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>
            <Monitor size={17} /> ผู้ดูแลระบบ
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
              {view === 'tickets' && 'จัดการ Ticket'}
              {view === 'assets' && 'จัดเก็บอุปกรณ์'}
              {view === 'reports' && 'รายงานย้อนหลัง'}
              {view === 'admin' && 'ผู้ดูแลระบบ'}
            </h1>
            <p>ติดตาม แก้ไข และอนุมัติคำขอจากทุกสาขา</p>
          </div>
          <div className="user">
            <span className="avatar">TL</span>
            <span>Tanakit Lertmana</span>
            <button className="ghost" onClick={() => setLoggedIn(false)}>
              <LogOut size={15} /> ออกจากระบบ
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

        {view === 'dashboard' && <DashboardView tickets={tickets} assets={assets} />}

        {view === 'tickets' && (
          <>
            <section className="stats">
              <Stat label="ทั้งหมด" value={tickets.length} note="รายการ" />
              <Stat label="รออนุมัติ" value={pending} note="ต้องตรวจสอบ" />
              <Stat label="กำลังดำเนินการ" value={tickets.filter((ticket) => ticket.status === 'In Progress').length} note="รายการ" />
              <Stat label="เสร็จสิ้น" value={tickets.filter((ticket) => ticket.status === 'Completed').length} note="รายการ" />
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>รายการคำขอ</h2>
                <button className="primary" onClick={() => openForm()}>
                  <Plus size={16} /> สร้าง Ticket
                </button>
              </div>

              <div className="filters">
                <label className="search">
                  <Search size={16} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา ID, สาขา หรือรายละเอียด" />
                </label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">ทุกสถานะ</option>
                  <option>Pending</option>
                  <option>In Progress</option>
                  <option>Completed</option>
                  <option>Rejected</option>
                </select>
                <select value={approvalFilter} onChange={(event) => setApprovalFilter(event.target.value)}>
                  <option value="">ทุกสถานะอนุมัติ</option>
                  <option value="pending">รอตรวจสอบ</option>
                  <option value="Approved">อนุมัติแล้ว</option>
                  <option value="Rejected">ไม่อนุมัติ</option>
                </select>
              </div>

              <div className="table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>สาขา</th>
                      <th>หมวดหมู่</th>
                      <th>รายละเอียด</th>
                      <th>ผู้รับผิดชอบ</th>
                      <th>สถานะ</th>
                      <th>อนุมัติ</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((ticket) => (
                      <TicketRow key={ticket.id} ticket={ticket} onEdit={() => openForm(ticket)} onApprove={(decision) => void approve(ticket, decision)} onViewAttachments={(t) => setAttachmentModal(t)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {view === 'assets' && <AssetView assets={assets} onAdd={() => openAssetForm()} onEdit={(asset) => openAssetForm(asset)} />}

        {view === 'reports' && <Reports tickets={tickets} onExport={exportCsv} />}

        {view === 'admin' && (
          <AdminView
          users={users}
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

function DashboardView({ tickets, assets }: { tickets: Ticket[]; assets: Asset[] }) {
  const totalTickets = tickets.length;
  const pending = tickets.filter((ticket) => !ticket.approval).length;
  const inProgress = tickets.filter((ticket) => ticket.status === 'In Progress').length;
  const completed = tickets.filter((ticket) => ticket.status === 'Completed').length;
  const available = assets.filter((asset) => asset.status === 'Available').length;
  const inUse = assets.filter((asset) => asset.status === 'In Use').length;
  const maintenance = assets.filter((asset) => asset.status === 'Maintenance').length;

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

  return (
    <>
      <section className="stats">
        <Stat label="รวม Ticket" value={totalTickets} note="รายการ" />
        <Stat label="รออนุมัติ" value={pending} note="ต้องตรวจสอบ" />
        <Stat label="อุปกรณ์ใช้งาน" value={inUse} note="เครื่อง" />
        <Stat label="ซ่อมบำรุง" value={maintenance} note="เครื่อง" />
      </section>

      <section className="dashboard-grid">
        <div className="panel analytics-panel">
          <div className="panel-head">
            <h2>ภาพรวมสถานะ Ticket</h2>
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
            <h2>ยอดใช้ตามหมวดหมู่</h2>
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
        <div className="panel">
          <div className="panel-head">
            <h2>สรุปอุปกรณ์</h2>
          </div>
          <div className="report-list">
            <p>
              พร้อมใช้งาน <b>{available}</b>
            </p>
            <p>
              กำลังใช้งาน <b>{inUse}</b>
            </p>
            <p>
              รอซ่อม/ตรวจสอบ <b>{maintenance}</b>
            </p>
            <p>
              รวมทั้งหมด <b>{assets.length}</b>
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Ticket ล่าสุด</h2>
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
            {!tickets.length && <p className="empty-state">ยังไม่มี Ticket</p>}
          </div>
        </div>
      </section>
    </>
  );
}

function AssetView({ assets, onAdd, onEdit }: { assets: Asset[]; onAdd: () => void; onEdit: (asset: Asset) => void }) {
  const groupedByLocation = assets.reduce<Record<string, Asset[]>>((result, asset) => {
    result[asset.location] = [...(result[asset.location] ?? []), asset];
    return result;
  }, {});

  return (
    <section className="panel asset-inventory-panel">
      <div className="panel-head">
        <h2>จัดเก็บอุปกรณ์</h2>
        <button className="primary" onClick={onAdd}>
          <Plus size={16} /> เพิ่มอุปกรณ์
        </button>
      </div>

      <div className="table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>ชื่ออุปกรณ์</th>
              <th>ประเภท</th>
              <th>Serial</th>
              <th>สถานที่</th>
              <th>เจ้าของ</th>
              <th>สถานะ</th>
              <th>วันที่ซื้อ</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id}>
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
                    <button className="icon-button" title="แก้ไข" onClick={() => onEdit(asset)}>
                      <Pencil size={14} />
                    </button>
                    {asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString('th-TH') : '-'}
                  </div>
                </td>
              </tr>
            ))}
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
          <input value={id} onChange={(event) => setId(event.target.value)} placeholder="เช่น 7748" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button className="primary">เข้าสู่ระบบ</button>
        {failed && <small className="error">Staff ID หรือรหัสผ่านไม่ถูกต้อง</small>}
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

function TicketRow({ ticket, onEdit, onApprove, onViewAttachments }: { ticket: Ticket; onEdit: () => void; onApprove: (decision: 'Approved' | 'Rejected') => void; onViewAttachments?: (ticket: Ticket) => void }) {
  return (
    <tr>
      <td>
        <b className="ticket-id">#{ticket.id}</b>
        <small>
          สร้าง: {new Date(ticket.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: '2-digit' })} 
          {ticket.createdAt && ' ' + new Date(ticket.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
          {ticket.completedAt && <><br />ปิด: {new Date(ticket.completedAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: '2-digit' })} {new Date(ticket.completedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</>}
          {ticket.attachments && ticket.attachments.length > 0 && <><br /><span className="attachment-indicator">📎 {ticket.attachments.length} ไฟล์</span></>}
        </small>
      </td>
      <td>{ticket.storeName}</td>
      <td>{ticket.category}</td>
      <td className="desc">{ticket.description}</td>
      <td>{ticket.assignee}</td>
      <td>
        <span className={`badge ${ticket.status.toLowerCase().replace(' ', '-')}`}>{ticket.status}</span>
      </td>
      <td>
        <span className={`badge ${ticket.approval ? ticket.approval.toLowerCase() : 'waiting'}`}>
          {ticket.approval === 'Approved' ? 'อนุมัติแล้ว' : ticket.approval === 'Rejected' ? 'ไม่อนุมัติ' : 'รอตรวจสอบ'}
        </span>
      </td>
      <td>
        <div className="actions">
          {ticket.attachments && ticket.attachments.length > 0 && (
            <button className="icon-button" title="ดูไฟล์แนบ" onClick={() => onViewAttachments?.(ticket)}>
              📎
            </button>
          )}
          <button className="icon-button" title="แก้ไข" onClick={onEdit}>
            <Pencil size={14} />
          </button>
          {!ticket.approval && (
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
  masterData,
  setMasterData,
  onAddUser,
  onEditUser,
}: {
  users: User[];
  masterData: MasterData;
  setMasterData: (data: MasterData) => void;
  onAddUser: () => void;
  onEditUser: (user: User) => void;
}) {
  const [categoryInput, setCategoryInput] = useState('');
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [locationIdInput, setLocationIdInput] = useState('');
  const [locationShortNameInput, setLocationShortNameInput] = useState('');
  const [locationFullNameInput, setLocationFullNameInput] = useState('');
  const [editingLocationKey, setEditingLocationKey] = useState<string | null>(null);
  const [vendorInput, setVendorInput] = useState('');
  const [editingVendorKey, setEditingVendorKey] = useState<string | null>(null);

  const sortList = (items: string[]) => [...items].sort((a, b) => a.localeCompare(b, 'th', { sensitivity: 'base' }));
  const sortLocationList = (items: LocationMasterItem[]) => [...items].sort((a, b) => formatLocationLabel(a).localeCompare(formatLocationLabel(b), 'th', { sensitivity: 'base' }));

  const resetLocationForm = () => {
    setLocationIdInput('');
    setLocationShortNameInput('');
    setLocationFullNameInput('');
    setEditingLocationKey(null);
  };

  const addCategoryItem = () => {
    const normalized = categoryInput.trim();
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

  const addVendorItem = () => {
    const normalized = vendorInput.trim();
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
      };
      if (!item.id && !item.shortName && !item.fullName) return;

      const nextLocations = editingLocationKey
        ? masterData.locations.map((entry) => {
            const entryKey = `${entry.id}-${entry.shortName}-${entry.fullName}`;
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
    const key = `${item.id}-${item.shortName}-${item.fullName}`;
    setMasterData({
      ...masterData,
      locations: masterData.locations.filter((entry) => `${entry.id}-${entry.shortName}-${entry.fullName}` !== key),
    });
    if (editingLocationKey === key) resetLocationForm();
  };

  const beginEditLocation = (item: LocationMasterItem) => {
    setLocationIdInput(item.id);
    setLocationShortNameInput(item.shortName);
    setLocationFullNameInput(item.fullName);
    setEditingLocationKey(`${item.id}-${item.shortName}-${item.fullName}`);
  };

  const categoryItems = sortList(masterData.categories);
  const vendorItems = sortList(masterData.vendors);
  const locationItems = sortLocationList(masterData.locations);

  return (
    <section className="panel admin-master-panel">
      <div className="panel-head">
        <h2>ผู้ดูแลระบบ</h2>
      </div>

      <div className="admin-layout">
        <div className="panel admin-users-panel">
          <div className="panel-head">
            <h2>รายชื่อผู้ใช้งาน</h2>
            <button className="primary" onClick={onAddUser}>
              <Plus size={16} /> เพิ่มรายชื่อ
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
              <p className="empty-state">ยังไม่มีข้อมูลผู้ใช้งาน</p>
            )}
          </div>
        </div>

        <div className="panel admin-form-panel">
          <div className="panel-head">
            <h2>จัดการข้อมูลหลัก</h2>
          </div>

          <div className="master-data-sections">
            <div className="master-data-section">
              <div className="master-data-header">
                <div>
                  <h3>Category</h3>
                  <small>ประเภทอุปกรณ์</small>
                </div>
                <span className="master-data-count">{masterData.categories.length}</span>
              </div>
              <div className="inline-form">
                <input value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} placeholder="เพิ่ม category" />
                <button className="primary" onClick={addCategoryItem}>{editingCategoryKey ? 'บันทึก' : 'เพิ่ม'}</button>
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
                <p className="empty-mini">ยังไม่มีข้อมูล</p>
              )}
            </div>

            <div className="master-data-section">
              <div className="master-data-header">
                <div>
                  <h3>Vendor</h3>
                  <small>ผู้จำหน่าย</small>
                </div>
                <span className="master-data-count">{masterData.vendors.length}</span>
              </div>
              <div className="inline-form">
                <input value={vendorInput} onChange={(event) => setVendorInput(event.target.value)} placeholder="เพิ่ม vendor" />
                <button className="primary" onClick={addVendorItem}>{editingVendorKey ? 'บันทึก' : 'เพิ่ม'}</button>
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
                  <small>สาขา / สถานที่</small>
                </div>
                <span className="master-data-count">{masterData.locations.length}</span>
              </div>
              <div className="location-inputs">
                <input value={locationIdInput} onChange={(event) => setLocationIdInput(event.target.value)} placeholder="ไอดี เช่น HQ / 201" />
                <input value={locationShortNameInput} onChange={(event) => setLocationShortNameInput(event.target.value)} placeholder="ชื่อย่อ เช่น สำนักงานใหญ่ / MGB" />
                <input value={locationFullNameInput} onChange={(event) => setLocationFullNameInput(event.target.value)} placeholder="ชื่อเต็ม เช่น Head Office / Mega Bangna" />
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
                    const key = `${item.id}-${item.shortName}-${item.fullName}`;
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
}: {
  form: Partial<Asset>;
  setForm: (form: Partial<Asset>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  editing: boolean;
  masterData: MasterData;
}) {
  const update = (key: keyof Asset, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={onSubmit}>
        <div className="modal-head">
          <h2>{editing ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์ใหม่'}</h2>
          <button type="button" className="close" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="form-grid">
          <label>
            ชื่ออุปกรณ์
            <input required value={form.assetName ?? ''} onChange={(event) => update('assetName', event.target.value)} />
          </label>
          <label>
            ประเภท
            <select required value={form.category ?? ''} onChange={(event) => update('category', event.target.value)}>
              <option value="">เลือกประเภท</option>
              {(masterData.categories.length ? masterData.categories : ['Notebook/Macbook', 'POS Terminal', 'Printer', 'Network']).map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Serial Number
            <input value={form.serialNumber ?? ''} onChange={(event) => update('serialNumber', event.target.value)} />
          </label>
          <label>
            สถานที่
            <select value={form.location ?? ''} onChange={(event) => update('location', event.target.value)}>
              <option value="">เลือกสาขา</option>
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
            เจ้าของ
            <input value={form.owner ?? ''} onChange={(event) => update('owner', event.target.value)} />
          </label>
          <label>
            สถานะ
            <select value={form.status ?? 'In Use'} onChange={(event) => update('status', event.target.value as AssetStatus)}>
              <option>In Use</option>
              <option>Available</option>
              <option>Maintenance</option>
            </select>
          </label>
          <label>
            วันที่ซื้อ
            <input type="date" value={form.purchaseDate ?? ''} onChange={(event) => update('purchaseDate', event.target.value)} />
          </label>
          <label>
            วันที่ติดตั้ง
            <input type="date" value={form.installationDate ?? ''} onChange={(event) => update('installationDate', event.target.value)} />
          </label>
          <label className="full">
            ผู้จำหน่าย
            <input value={form.vendor ?? ''} onChange={(event) => update('vendor', event.target.value)} />
          </label>
          <label className="full">
            หมายเหตุ
            <textarea rows={3} value={form.remark ?? ''} onChange={(event) => update('remark', event.target.value)} />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>ยกเลิก</button>
          <button className="primary">บันทึก</button>
        </div>
      </form>
    </div>
  );
}

function Reports({ tickets, onExport }: { tickets: Ticket[]; onExport: () => void }) {
  const groups = Object.entries(
    tickets.reduce<Record<string, number>>((result, ticket) => {
      result[ticket.category] = (result[ticket.category] ?? 0) + 1;
      return result;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const max = Math.max(...groups.map(([, count]) => count), 1);

  return (
    <>
      <section className="report-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>ภาพรวมตามหมวดหมู่</h2>
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
            <p>ยังไม่มีข้อมูล</p>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>สรุปสถานะ</h2>
          </div>
          <div className="report-list">
            <p>
              รออนุมัติ <b>{tickets.filter((ticket) => !ticket.approval).length}</b>
            </p>
            <p>
              อนุมัติแล้ว <b>{tickets.filter((ticket) => ticket.approval === 'Approved').length}</b>
            </p>
            <p>
              ไม่อนุมัติ <b>{tickets.filter((ticket) => ticket.approval === 'Rejected').length}</b>
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>ประวัติทั้งหมด</h2>
          <button className="ghost" onClick={onExport}>
            <Download size={15} /> ดาวน์โหลด CSV
          </button>
        </div>
        <p className="sub">มี Ticket ทั้งหมด {tickets.length} รายการ</p>
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
          <h2>{editing ? 'แก้ไข Ticket' : 'สร้าง Ticket ใหม่'}</h2>
          <button type="button" className="close" onClick={onClose}>
            <X />
          </button>
        </div>
        {error && <div className="error-message" style={{ color: '#e74c3c', padding: '10px', background: '#fadbd8', borderRadius: '4px', margin: '10px', fontSize: '14px' }}>{error}</div>}

        <div className="form-grid">
          <label>
            สาขา / สถานที่
            <select required value={form.storeName} onChange={(event) => update('storeName', event.target.value)}>
              <option value="">เลือกสาขา</option>
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
            หมวดหมู่
            <select required value={form.category} onChange={(event) => update('category', event.target.value)}>
              <option value="">เลือกหมวดหมู่</option>
              {(masterData.categories.length ? masterData.categories : ['Front2 POS', 'Printer', 'Internet/WiFi']).map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="full">
            รายละเอียดปัญหา
            <textarea required rows={4} value={form.description} onChange={(event) => update('description', event.target.value)} />
          </label>
          <label>
            ผู้รับผิดชอบ
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
            แนบไฟล์ (รูป, Excel, PDF)
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
                    setError(`ขนาดไฟล์รวมไม่ควรเกิน 50 MB (ปัจจุบัน ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
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
              <small>ไฟล์ที่เลือก:</small>
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
