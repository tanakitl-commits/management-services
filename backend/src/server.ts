import cors from 'cors';
import express from 'express';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const dataFile = join(dirname(fileURLToPath(import.meta.url)), '../data/tickets.json');
const assetsFile = join(dirname(fileURLToPath(import.meta.url)), '../data/assets.json');
const usersFile = join(dirname(fileURLToPath(import.meta.url)), '../data/users.json');
const masterDataFile = join(dirname(fileURLToPath(import.meta.url)), '../data/master-data.json');

const statusSchema = z.enum(['Pending', 'In Progress', 'Completed', 'Rejected']);
const permissionSchema = z.object({
  dashboard: z.boolean(),
  tickets: z.boolean(),
  assets: z.boolean(),
  reports: z.boolean(),
  administrator: z.boolean(),
});
const attachmentSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  data: z.string().min(1),
});
const normalizeMasterDataText = (value: string) => value.trim().toUpperCase();
const ticketInputSchema = z.object({
  storeName: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(2000),
  assignee: z.string().trim().min(1).max(120),
  status: statusSchema.default('Pending'),
  attachments: z.array(attachmentSchema).optional(),
});
const ticketPatchSchema = ticketInputSchema.partial();
const assetInputSchema = z.object({
  assetName: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  serialNumber: z.string().trim().max(160).default(''),
  location: z.string().trim().min(1).max(200),
  owner: z.string().trim().min(1).max(120),
  status: z.enum(['In Use', 'Available', 'Maintenance']),
  purchaseDate: z.string().trim().max(20).default(''),
  installationDate: z.string().trim().max(20).optional(),
  vendor: z.string().trim().max(160).optional(),
  priceBeforeVat: z.number().finite().min(0).optional(),
  priceBeforeVatUsd: z.number().finite().min(0).optional(),
  remark: z.string().max(2000).optional(),
  replacementAvailability: z.enum(['yes', 'no']).optional(),
  replacementDetails: z.string().max(1000).optional(),
});
const assetPatchSchema = assetInputSchema.partial();
const userInputSchema = z.object({
  staffId: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  password: z.string().trim().min(1).max(40),
  role: z.enum(['admin', 'user']),
  permissions: permissionSchema,
});
const userPatchSchema = userInputSchema.partial();
const approvalSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']),
  approvedBy: z.string().trim().min(1).max(120),
});

type Ticket = z.infer<typeof ticketInputSchema> & {
  id: string;
  approval: '' | 'Approved' | 'Rejected';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  attachments?: Array<{ name: string; type: string; data: string }>;
};

type Asset = {
  id: string;
  assetName: string;
  category: string;
  serialNumber: string;
  location: string;
  owner: string;
  status: 'In Use' | 'Available' | 'Maintenance';
  purchaseDate: string;
  installationDate?: string;
  vendor?: string;
  priceBeforeVat?: number;
  priceBeforeVatUsd?: number;
  remark?: string;
  replacementAvailability?: 'yes' | 'no';
  replacementDetails?: string;
  createdAt?: string;
  updatedAt?: string;
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

function normalizeLocationEntry(value: string | LocationMasterItem | null | undefined): LocationMasterItem | null {
  if (!value) return null;

  if (typeof value !== 'string') {
    const id = (value.id ?? '').trim();
    const shortName = (value.shortName ?? '').trim();
    const fullName = (value.fullName ?? '').trim();
    const budget = typeof value.budget === 'number' && Number.isFinite(value.budget) && value.budget >= 0 ? value.budget : undefined;

    if (!id && !shortName && !fullName) return null;
    return { id: id || shortName || fullName, shortName, fullName, budget };
  }

  const text = value.trim();
  if (!text) return null;

  const locationMatch = text.match(/^([A-Za-z0-9]+)\s*-\s*(.+?)\s*\((.+)\)$/);
  if (locationMatch) {
    return {
      id: locationMatch[1].trim(),
      shortName: locationMatch[2].trim(),
      fullName: locationMatch[3].trim(),
    };
  }

  const legacyMatch = text.match(/^(\d+)\s+([A-Za-z0-9]+)\s+(.+)$/);
  if (legacyMatch) {
    return {
      id: legacyMatch[1].trim(),
      shortName: legacyMatch[2].trim(),
      fullName: legacyMatch[3].trim(),
    };
  }

  return { id: text, shortName: '', fullName: text };
}

function locationKey(location: LocationMasterItem) {
  return `${location.id ?? ''}|${location.shortName ?? ''}|${location.fullName ?? ''}`.toLowerCase();
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    await writeJsonFile(filePath, fallback);
    return fallback;
  }
}

async function writeJsonFile<T>(filePath: string, data: T) {
  const dataDirectory = dirname(filePath);
  const backupDirectory = join(dataDirectory, 'backups');
  const backupFile = join(backupDirectory, basename(filePath));
  const temporaryFile = `${filePath}.tmp`;

  await mkdir(dataDirectory, { recursive: true });
  await mkdir(backupDirectory, { recursive: true });
  try {
    await copyFile(filePath, backupFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await writeFile(temporaryFile, JSON.stringify(data, null, 2));
  await rename(temporaryFile, filePath);
}

async function readTickets(): Promise<Ticket[]> {
  return readJsonFile<Ticket[]>(dataFile, []);
}

async function saveTickets(tickets: Ticket[]) {
  await writeJsonFile(dataFile, tickets);
}

async function readAssets(): Promise<Asset[]> {
  return readJsonFile<Asset[]>(assetsFile, []);
}

async function saveAssets(assets: Asset[]) {
  await writeJsonFile(assetsFile, assets);
}

async function readUsers(): Promise<User[]> {
  return readJsonFile<User[]>(usersFile, []);
}

async function saveUsers(users: User[]) {
  await writeJsonFile(usersFile, users);
}

async function readMasterData(): Promise<MasterData> {
  const [assets, storedData] = await Promise.all([
    readAssets(),
    readJsonFile<MasterData>(masterDataFile, {
      categories: [],
      assetTypes: [],
      vendors: [],
      locations: [],
    }),
  ]);

  const uniqueLocations = new Map<string, LocationMasterItem>();
  [...storedData.locations, ...assets.map((asset) => normalizeLocationEntry(asset.location)).filter((entry): entry is LocationMasterItem => !!entry)]
    .forEach((location) => uniqueLocations.set(locationKey(location), location));

  const merged: MasterData = {
    categories: [...new Set(storedData.categories.map(normalizeMasterDataText))],
    assetTypes: [...new Set((storedData.assetTypes ?? []).map(normalizeMasterDataText))],
    vendors: [...new Set(storedData.vendors.map(normalizeMasterDataText))],
    locations: [...uniqueLocations.values()].sort((a, b) => `${a.id} ${a.shortName} ${a.fullName}`.localeCompare(`${b.id} ${b.shortName} ${b.fullName}`, 'th', { sensitivity: 'base' })),
  };

  if (JSON.stringify(merged) !== JSON.stringify(storedData)) {
    await writeJsonFile(masterDataFile, merged);
  }

  return merged;
}

function createTicketId(tickets: Ticket[], createdAt: Date) {
  const datePart = createdAt.toISOString().slice(0, 10).replaceAll('-', '');
  const sequence = tickets.reduce((highest, ticket) => {
    const match = ticket.id.match(new RegExp(`^IT-${datePart}-(\\d{4})$`));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  return `IT-${datePart}-${String(sequence).padStart(4, '0')}`;
}

function sendValidationError(res: express.Response, error: z.ZodError) {
  return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง', issues: error.issues });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'ticket-backend' }));

app.get('/api/tickets', async (_req, res, next) => {
  try {
    const tickets = await readTickets();
    res.json(tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  } catch (error) {
    next(error);
  }
});

app.get('/api/assets', async (_req, res, next) => {
  try {
    const assets = await readAssets();
    res.json(assets);
  } catch (error) {
    next(error);
  }
});

app.post('/api/assets', async (req, res, next) => {
  try {
    const input = assetInputSchema.parse(req.body);
    const assets = await readAssets();
    const serialNumber = input.serialNumber.toLowerCase();
    if (serialNumber && assets.some((asset) => asset.serialNumber.trim().toLowerCase() === serialNumber)) {
      return res.status(409).json({ message: 'Serial Number นี้มีอยู่ในระบบแล้ว' });
    }

    const now = new Date().toISOString();
    const datePart = now.slice(0, 10).replaceAll('-', '');
    const asset: Asset = {
      ...input,
      id: `AS-${datePart}-${String(assets.length + 1).padStart(4, '0')}`,
      createdAt: now,
      updatedAt: now,
    };
    assets.unshift(asset);
    await saveAssets(assets);
    res.status(201).json(asset);
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    next(error);
  }
});

app.patch('/api/assets/:id', async (req, res, next) => {
  try {
    const patch = assetPatchSchema.parse(req.body);
    const assets = await readAssets();
    const index = assets.findIndex((asset) => asset.id === req.params.id);
    if (index === -1) return res.status(404).json({ message: 'ไม่พบอุปกรณ์' });

    const serialNumber = patch.serialNumber?.toLowerCase();
    if (serialNumber && assets.some((asset) => asset.id !== req.params.id && asset.serialNumber.trim().toLowerCase() === serialNumber)) {
      return res.status(409).json({ message: 'Serial Number นี้มีอยู่ในระบบแล้ว' });
    }

    const asset = { ...assets[index], ...patch, updatedAt: new Date().toISOString() };
    assets[index] = asset;
    await saveAssets(assets);
    res.json(asset);
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    next(error);
  }
});

app.delete('/api/assets/:id', async (req, res, next) => {
  try {
    const assets = await readAssets();
    const index = assets.findIndex((asset) => asset.id === req.params.id);
    if (index === -1) return res.status(404).json({ message: 'ไม่พบอุปกรณ์' });

    const [deletedAsset] = assets.splice(index, 1);
    await saveAssets(assets);
    res.json(deletedAsset);
  } catch (error) {
    next(error);
  }
});

app.get('/api/users', async (_req, res, next) => {
  try {
    const users = await readUsers();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

app.post('/api/users', async (req, res, next) => {
  try {
    const input = userInputSchema.parse(req.body);
    const users = await readUsers();
    const duplicate = users.some((user) => user.staffId === input.staffId || user.name.toLowerCase() === input.name.toLowerCase());
    if (duplicate) return res.status(409).json({ message: 'Staff ID หรือชื่อผู้ใช้งานซ้ำในระบบ' });

    const user: User = {
      ...input,
      permissions: input.role === 'admin' ? {
        dashboard: true,
        tickets: true,
        assets: true,
        reports: true,
        administrator: true,
      } : input.permissions,
    };

    users.push(user);
    await saveUsers(users);
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    next(error);
  }
});

app.patch('/api/users/:staffId', async (req, res, next) => {
  try {
    const patch = userPatchSchema.parse(req.body);
    const users = await readUsers();
    const index = users.findIndex((user) => user.staffId === req.params.staffId);
    if (index === -1) return res.status(404).json({ message: 'ไม่พบผู้ใช้งาน' });

    const nextUser = {
      ...users[index],
      ...patch,
      permissions: patch.role === 'admin'
        ? {
            dashboard: true,
            tickets: true,
            assets: true,
            reports: true,
            administrator: true,
          }
        : { ...users[index].permissions, ...patch.permissions },
    }; 

    users[index] = nextUser;
    await saveUsers(users);
    res.json(nextUser);
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    next(error);
  }
});

app.get('/api/master-data', async (_req, res, next) => {
  try {
    const masterData = await readMasterData();
    res.json(masterData);
  } catch (error) {
    next(error);
  }
});

app.put('/api/master-data', async (req, res, next) => {
  try {
    const payload = z.object({
      categories: z.array(z.string().trim().min(1)).default([]),
      assetTypes: z.array(z.string().trim().min(1)).default([]),
      vendors: z.array(z.string().trim().min(1)).default([]),
      locations: z.array(
        z.union([
          z.string().trim().min(1),
          z.object({
            id: z.string().trim().min(1),
            shortName: z.string().trim().default(''),
            fullName: z.string().trim().default(''),
            budget: z.number().finite().min(0).optional(),
          }),
        ]),
      ).default([]),
    }).parse(req.body);

    const normalizedLocations = payload.locations
      .map((entry) => normalizeLocationEntry(entry))
      .filter((entry): entry is LocationMasterItem => !!entry);

    const uniqueLocations = new Map<string, LocationMasterItem>();
    normalizedLocations.forEach((location) => uniqueLocations.set(locationKey(location), location));

    const masterData: MasterData = {
      categories: [...new Set(payload.categories.map(normalizeMasterDataText))],
      assetTypes: [...new Set(payload.assetTypes.map(normalizeMasterDataText))],
      vendors: [...new Set(payload.vendors.map(normalizeMasterDataText))],
      locations: [...uniqueLocations.values()].sort((a, b) => `${a.id} ${a.shortName} ${a.fullName}`.localeCompare(`${b.id} ${b.shortName} ${b.fullName}`, 'th', { sensitivity: 'base' })),
    };

    await writeJsonFile(masterDataFile, masterData);
    res.json(masterData);
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    next(error);
  }
});

app.get('/api/reports/summary', async (_req, res, next) => {
  try {
    const tickets = await readTickets();
    const byCategory = tickets.reduce<Record<string, number>>((result, ticket) => {
      result[ticket.category] = (result[ticket.category] ?? 0) + 1;
      return result;
    }, {});
    res.json({
      total: tickets.length,
      pendingApproval: tickets.filter((ticket) => !ticket.approval).length,
      approved: tickets.filter((ticket) => ticket.approval === 'Approved').length,
      rejected: tickets.filter((ticket) => ticket.approval === 'Rejected').length,
      byStatus: {
        Pending: tickets.filter((ticket) => ticket.status === 'Pending').length,
        'In Progress': tickets.filter((ticket) => ticket.status === 'In Progress').length,
        Completed: tickets.filter((ticket) => ticket.status === 'Completed').length,
        Rejected: tickets.filter((ticket) => ticket.status === 'Rejected').length,
      },
      byCategory,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/tickets', async (req, res, next) => {
  try {
    const input = ticketInputSchema.parse(req.body);
    const now = new Date().toISOString();
    const tickets = await readTickets();
    const ticket: Ticket = {
      ...input,
      id: createTicketId(tickets, new Date(now)),
      approval: '',
      createdAt: now,
      updatedAt: now,
    };
    tickets.push(ticket);
    await saveTickets(tickets);
    res.status(201).json(ticket);
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    next(error);
  }
});

app.patch('/api/tickets/:id', async (req, res, next) => {
  try {
    const patch = ticketPatchSchema.parse(req.body);
    const tickets = await readTickets();
    const index = tickets.findIndex((ticket) => ticket.id === req.params.id);
    if (index === -1) return res.status(404).json({ message: 'ไม่พบ Ticket' });
    
    const now = new Date().toISOString();
    const updated: Ticket = {
      ...tickets[index],
      ...patch,
      updatedAt: now,
      // Auto-set completedAt when status changes to Completed
      ...(patch.status === 'Completed' && tickets[index].status !== 'Completed' ? { completedAt: now } : {}),
    };
    tickets[index] = updated;
    await saveTickets(tickets);
    res.json(tickets[index]);
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    next(error);
  }
});

app.patch('/api/tickets/:id/approval', async (req, res, next) => {
  try {
    const { decision, approvedBy } = approvalSchema.parse(req.body);
    const tickets = await readTickets();
    const index = tickets.findIndex((ticket) => ticket.id === req.params.id);
    if (index === -1) return res.status(404).json({ message: 'ไม่พบ Ticket' });
    tickets[index] = {
      ...tickets[index],
      approval: decision,
      approvedBy,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(decision === 'Rejected' ? { status: 'Rejected' } : {}),
    };
    await saveTickets(tickets);
    res.json(tickets[index]);
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    next(error);
  }
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', error);
  const message = error.message || 'เกิดข้อผิดพลาดในระบบ';
  res.status(500).json({ message, error: message });
});

app.listen(port, () => console.log(`Ticket API listening on http://localhost:${port}`));
