import { FormEvent, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  Check,
  ClipboardList,
  Download,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import './styles.css';

type Status = 'Pending' | 'In Progress' | 'Completed' | 'Rejected';
type AssetStatus = 'Available' | 'In Use' | 'Maintenance' | 'Retired';

type Ticket = {
  id: string;
  storeName: string;
  category: string;
  description: string;
  assignee: string;
  status: Status;
  approval: '' | 'Approved' | 'Rejected';
  createdAt: string;
};

type Asset = {
  id: string;
  assetName: string;
  category: string;
  serialNumber: string;
  location: string;
  owner: string;
  status: AssetStatus;
  purchaseDate: string;
  notes: string;
  createdAt: string;
};

type TicketForm = Omit<Ticket, 'id' | 'approval' | 'createdAt'>;
type AssetForm = Omit<Asset, 'id' | 'createdAt'>;

const emptyForm: TicketForm = { storeName: '', category: '', description: '', assignee: '', status: 'Pending' };
const emptyAssetForm: AssetForm = {
  assetName: '',
  category: '',
  serialNumber: '',
  location: '',
  owner: '',
  status: 'Available',
  purchaseDate: new Date().toISOString().slice(0, 10),
  notes: '',
};

const categories = ['Network / WiFi', 'POS / Register', 'Printer', 'Hardware', 'Microsoft 365', 'Other'];
const assetCategories = ['Laptop', 'Desktop', 'Printer', 'Monitor', 'Network', 'Phone', 'Peripheral', 'Other'];

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? 'เกิดข้อผิดพลาด');
  }
  return response.json();
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [view, setView] = useState<'dashboard' | 'tickets' | 'assets' | 'reports'>('dashboard');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [ticketModal, setTicketModal] = useState<Ticket | 'new' | null>(null);
  const [assetModal, setAssetModal] = useState<Asset | 'new' | null>(null);
  const [ticketForm, setTicketForm] = useState<TicketForm>(emptyForm);
  const [assetForm, setAssetForm] = useState<AssetForm>(emptyAssetForm);
  const [assetQuery, setAssetQuery] = useState('');
  const [assetStatusFilter, setAssetStatusFilter] = useState('');
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

  useEffect(() => {
    if (loggedIn) {
      void loadTickets();
      void loadAssets();
    }
  }, [loggedIn]);

  const filteredTickets = tickets.filter((ticket) => {
    const text = `${ticket.id} ${ticket.storeName} ${ticket.category} ${ticket.description}`.toLowerCase();
    return (
      text.includes(query.toLowerCase()) &&
      (!statusFilter || ticket.status === statusFilter) &&
      (!approvalFilter || (approvalFilter === 'pending' ? !ticket.approval : ticket.approval === approvalFilter))
    );
  });

  const filteredAssets = assets.filter((asset) => {
    const text = `${asset.id} ${asset.assetName} ${asset.category} ${asset.location} ${asset.owner} ${asset.serialNumber}`.toLowerCase();
    return text.includes(assetQuery.toLowerCase()) && (!assetStatusFilter || asset.status === assetStatusFilter);
  });

  const pending = tickets.filter((ticket) => !ticket.approval).length;
  const inProgressCount = tickets.filter((ticket) => ticket.status === 'In Progress').length;
  const completedCount = tickets.filter((ticket) => ticket.status === 'Completed').length;
  const assetAvailableCount = assets.filter((asset) => asset.status === 'Available').length;
  const assetMaintenanceCount = assets.filter((asset) => asset.status === 'Maintenance').length;

  const openTicketForm = (ticket?: Ticket) => {
    setTicketForm(
      ticket
        ? {
            storeName: ticket.storeName,
            category: ticket.category,
            description: ticket.description,
            assignee: ticket.assignee,
            status: ticket.status,
          }
        : { ...emptyForm, assignee: 'Tanakit Lertmana' },
    );
    setTicketModal(ticket ?? 'new');
  };

  const openAssetForm = (asset?: Asset) => {
    setAssetForm(
      asset
        ? {
            assetName: asset.assetName,
            category: asset.category,
            serialNumber: asset.serialNumber,
            location: asset.location,
            owner: asset.owner,
            status: asset.status,
            purchaseDate: asset.purchaseDate,
            notes: asset.notes,
          }
        : { ...emptyAssetForm, owner: 'Tanakit Lertmana' },
    );
    setAssetModal(asset ?? 'new');
  };

  const saveTicket = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (ticketModal !== 'new' && ticketModal) {
        await request(`/api/tickets/${ticketModal.id}`, { method: 'PATCH', body: JSON.stringify(ticketForm) });
      } else {
        await request('/api/tickets', { method: 'POST', body: JSON.stringify(ticketForm) });
      }
      setTicketModal(null);
      await loadTickets();
    } catch (saveError) {
      setError((saveError as Error).message);
    }
  };

  const saveAsset = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (assetModal !== 'new' && assetModal) {
        await request(`/api/assets/${assetModal.id}`, { method: 'PATCH', body: JSON.stringify(assetForm) });
      } else {
        await request('/api/assets', { method: 'POST', body: JSON.stringify(assetForm) });
      }
      setAssetModal(null);
      await loadAssets();
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

  const exportTicketsCsv = () => {
    const csv = [
      'ID,Store,Category,Description,Assignee,Status,Approval,Created',
      ...tickets.map((ticket) =>
        [
          ticket.id,
          ticket.storeName,
          ticket.category,
          ticket.description,
          ticket.assignee,
          ticket.status,
          ticket.approval,
          ticket.createdAt,
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    link.download = 'ticket-report.csv';
    link.click();
  };

  const exportAssetsCsv = () => {
    const csv = [
      'ID,Asset,Category,Serial,Location,Owner,Status,Purchase Date,Notes',
      ...assets.map((asset) =>
        [
          asset.id,
          asset.assetName,
          asset.category,
          asset.serialNumber,
          asset.location,
          asset.owner,
          asset.status,
          asset.purchaseDate,
          asset.notes,
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    link.download = 'asset-report.csv';
    link.click();
  };

  if (!loggedIn) {
    return <Login onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="mark">OD</span>
          <b>MANAGEMENT<br />SERVICES</b>
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
            <HardDrive size={17} /> Asset Management
          </button>
          <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>
            <BarChart3 size={17} /> รายงานย้อนหลัง
          </button>
        </nav>
        <div className="side-note">
          ระบบจัดการคำขอและทรัพย์สิน<br />
          <strong>Express + React</strong>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>
              {view === 'dashboard' && 'Dashboard'}
              {view === 'tickets' && 'จัดการ Ticket'}
              {view === 'assets' && 'Asset Management'}
              {view === 'reports' && 'รายงานย้อนหลัง'}
            </h1>
            <p>
              {view === 'dashboard' && 'ภาพรวมสถานะงานและทรัพย์สินภายในองค์กร'}
              {view === 'tickets' && 'ติดตาม แก้ไข และอนุมัติคำขอจากทุกสาขา'}
              {view === 'assets' && 'ติดตามอุปกรณ์และทรัพย์สินทาง IT ให้พร้อมใช้งาน'}
              {view === 'reports' && 'สรุปผลและข้อมูลเชิงประสิทธิภาพ'}
            </p>
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

        {view === 'dashboard' && (
          <div className="dashboard-grid">
            <StatCard label="Ticket ทั้งหมด" value={tickets.length} note="รายการ" accent="blue" />
            <StatCard label="รออนุมัติ" value={pending} note="ต้องตรวจสอบ" accent="amber" />
            <StatCard label="กำลังดำเนินการ" value={inProgressCount} note="รายการ" accent="green" />
            <StatCard label="Asset ทั้งหมด" value={assets.length} note="ทรัพย์สิน" accent="purple" />
            <StatCard label="Available" value={assetAvailableCount} note="พร้อมใช้งาน" accent="teal" />
            <StatCard label="Maintenance" value={assetMaintenanceCount} note="ต้องซ่อม" accent="red" />
          </div>
        )}

        {view === 'tickets' && (
          <>
            <section className="stats">
              <Stat label="ทั้งหมด" value={tickets.length} note="รายการ" />
              <Stat label="รออนุมัติ" value={pending} note="ต้องตรวจสอบ" />
              <Stat label="กำลังดำเนินการ" value={inProgressCount} note="รายการ" />
              <Stat label="เสร็จสิ้น" value={completedCount} note="รายการ" />
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>รายการคำขอ</h2>
                <button className="primary" onClick={() => openTicketForm()}>
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
                  <option value="">ทุกการอนุมัติ</option>
                  <option value="pending">รอตรวจสอบ</option>
                  <option value="Approved">อนุมัติแล้ว</option>
                  <option value="Rejected">ไม่อนุมัติ</option>
                </select>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ticket</th>
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
                      <tr key={ticket.id}>
                        <td>
                          <b className="ticket-id">#{ticket.id}</b>
                          <small>{new Date(ticket.createdAt).toLocaleDateString('th-TH')}</small>
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
                            {ticket.approval === 'Approved'
                              ? 'อนุมัติแล้ว'
                              : ticket.approval === 'Rejected'
                                ? 'ไม่อนุมัติ'
                                : 'รอตรวจสอบ'}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            <button className="icon-button" title="แก้ไข" onClick={() => openTicketForm(ticket)}>
                              <Pencil size={14} />
                            </button>
                            {!ticket.approval && (
                              <>
                                <button className="icon-button approve" title="อนุมัติ" onClick={() => approve(ticket, 'Approved')}>
                                  <Check size={14} />
                                </button>
                                <button className="icon-button reject" title="ไม่อนุมัติ" onClick={() => approve(ticket, 'Rejected')}>
                                  <X size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {view === 'assets' && (
          <section className="panel">
            <div className="panel-head">
              <h2>รายการทรัพย์สิน</h2>
              <button className="primary" onClick={() => openAssetForm()}>
                <Plus size={16} /> เพิ่ม Asset
              </button>
            </div>

            <div className="filters">
              <label className="search">
                <Search size={16} />
                <input value={assetQuery} onChange={(event) => setAssetQuery(event.target.value)} placeholder="ค้นหาชื่ออุปกรณ์ / serial / สถานที่ / เจ้าของ" />
              </label>
              <select value={assetStatusFilter} onChange={(event) => setAssetStatusFilter(event.target.value)}>
                <option value="">ทุกสถานะ</option>
                <option>Available</option>
                <option>In Use</option>
                <option>Maintenance</option>
                <option>Retired</option>
              </select>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>หมวดหมู่</th>
                    <th>Serial</th>
                    <th>สถานที่</th>
                    <th>เจ้าของ</th>
                    <th>สถานะ</th>
                    <th>วันที่ซื้อ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((asset) => (
                    <tr key={asset.id}>
                      <td>
                        <b className="ticket-id">#{asset.id}</b>
                        <small>{asset.assetName}</small>
                      </td>
                      <td>{asset.category}</td>
                      <td>{asset.serialNumber}</td>
                      <td>{asset.location}</td>
                      <td>{asset.owner}</td>
                      <td>
                        <span className={`badge ${asset.status.toLowerCase().replace(/\s+/g, '-')}`}>{asset.status}</span>
                      </td>
                      <td>{new Date(asset.purchaseDate).toLocaleDateString('th-TH')}</td>
                      <td>
                        <div className="actions">
                          <button className="icon-button" title="แก้ไข" onClick={() => openAssetForm(asset)}>
                            <Pencil size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === 'reports' && <Reports tickets={tickets} assets={assets} onTicketExport={exportTicketsCsv} onAssetExport={exportAssetsCsv} />}

        {ticketModal && (
          <TicketModal
            form={ticketForm}
            setForm={setTicketForm}
            onClose={() => setTicketModal(null)}
            onSubmit={saveTicket}
            editing={ticketModal !== 'new'}
          />
        )}

        {assetModal && (
          <AssetModal
            form={assetForm}
            setForm={setAssetForm}
            onClose={() => setAssetModal(null)}
            onSubmit={saveAsset}
            editing={assetModal !== 'new'}
          />
        )}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);

  return (
    <div className="login">
      <form
        className="login-box"
        onSubmit={(event) => {
          event.preventDefault();
          if ((id === '7748' && password === '6081') || (id === 'IT02' && password === '456')) {
            onLogin();
          } else {
            setFailed(true);
          }
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

function StatCard({ label, value, note, accent }: { label: string; value: number; note: string; accent: 'blue' | 'amber' | 'green' | 'purple' | 'teal' | 'red' }) {
  return (
    <div className={`stat-card ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function Reports({
  tickets,
  assets,
  onTicketExport,
  onAssetExport,
}: {
  tickets: Ticket[];
  assets: Asset[];
  onTicketExport: () => void;
  onAssetExport: () => void;
}) {
  const groups = Object.entries(
    tickets.reduce<Record<string, number>>((result, ticket) => ({ ...result, [ticket.category]: (result[ticket.category] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...groups.map(([, count]) => count), 1);

  const assetByStatus = {
    Available: assets.filter((asset) => asset.status === 'Available').length,
    'In Use': assets.filter((asset) => asset.status === 'In Use').length,
    Maintenance: assets.filter((asset) => asset.status === 'Maintenance').length,
    Retired: assets.filter((asset) => asset.status === 'Retired').length,
  };

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
            <p>
              Asset พร้อมใช้งาน <b>{assetByStatus.Available}</b>
            </p>
            <p>
              Asset กำลังใช้งาน <b>{assetByStatus['In Use']}</b>
            </p>
            <p>
              Asset ซ่อมบำรุง <b>{assetByStatus.Maintenance}</b>
            </p>
          </div>
        </div>
      </section>

      <section className="panel report-actions">
        <div className="panel-head">
          <h2>Download Report</h2>
        </div>
        <div className="download-actions">
          <button className="ghost" onClick={onTicketExport}>
            <Download size={15} /> ดาวน์โหลด Ticket CSV
          </button>
          <button className="ghost" onClick={onAssetExport}>
            <Download size={15} /> ดาวน์โหลด Asset CSV
          </button>
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
}: {
  form: TicketForm;
  setForm: (form: TicketForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  editing: boolean;
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

        <div className="form-grid">
          <label>
            สาขา / สถานที่
            <input required value={form.storeName} onChange={(event) => update('storeName', event.target.value)} />
          </label>
          <label>
            หมวดหมู่
            <select required value={form.category} onChange={(event) => update('category', event.target.value)}>
              <option value="">เลือกหมวดหมู่</option>
              {categories.map((category) => (
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
            <input required value={form.assignee} onChange={(event) => update('assignee', event.target.value)} />
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

function AssetModal({
  form,
  setForm,
  onClose,
  onSubmit,
  editing,
}: {
  form: AssetForm;
  setForm: (form: AssetForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  editing: boolean;
}) {
  const update = (key: keyof AssetForm, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={onSubmit}>
        <div className="modal-head">
          <h2>{editing ? 'แก้ไข Asset' : 'เพิ่ม Asset ใหม่'}</h2>
          <button type="button" className="close" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="form-grid">
          <label>
            ชื่ออุปกรณ์
            <input required value={form.assetName} onChange={(event) => update('assetName', event.target.value)} />
          </label>
          <label>
            หมวดหมู่
            <select required value={form.category} onChange={(event) => update('category', event.target.value)}>
              <option value="">เลือกหมวดหมู่</option>
              {assetCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Serial Number
            <input required value={form.serialNumber} onChange={(event) => update('serialNumber', event.target.value)} />
          </label>
          <label>
            สถานที่ใช้งาน
            <input required value={form.location} onChange={(event) => update('location', event.target.value)} />
          </label>
          <label>
            เจ้าของ / ผู้รับผิดชอบ
            <input required value={form.owner} onChange={(event) => update('owner', event.target.value)} />
          </label>
          <label>
            สถานะ
            <select value={form.status} onChange={(event) => update('status', event.target.value as AssetStatus)}>
              <option>Available</option>
              <option>In Use</option>
              <option>Maintenance</option>
              <option>Retired</option>
            </select>
          </label>
          <label>
            วันที่ซื้อ
            <input type="date" required value={form.purchaseDate} onChange={(event) => update('purchaseDate', event.target.value)} />
          </label>
          <label className="full">
            หมายเหตุ
            <textarea rows={3} value={form.notes} onChange={(event) => update('notes', event.target.value)} />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="primary">บันทึก Asset</button>
        </div>
      </form>
    </div>
  );
}

export default App;

createRoot(document.getElementById('root')!).render(<App />);
