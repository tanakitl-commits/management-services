import cors from 'cors';
import express from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const ticketsFile = join(dirname(fileURLToPath(import.meta.url)), '../data/tickets.json');
const assetsFile = join(dirname(fileURLToPath(import.meta.url)), '../data/assets.json');

const statusSchema = z.enum(['Pending', 'In Progress', 'Completed', 'Rejected']);
const ticketInputSchema = z.object({
  storeName: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(2000),
  assignee: z.string().trim().min(1).max(120),
  status: statusSchema.default('Pending'),
});
const ticketPatchSchema = ticketInputSchema.partial();
const approvalSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']),
  approvedBy: z.string().trim().min(1).max(120),
});
const assetStatusSchema = z.enum(['Available', 'In Use', 'Maintenance', 'Retired']);
const assetInputSchema = z.object({
  assetName: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  serialNumber: z.string().trim().min(1).max(120),
  location: z.string().trim().min(1).max(120),
  owner: z.string().trim().min(1).max(120),
  status: assetStatusSchema.default('Available'),
  purchaseDate: z.string().trim().min(1).max(40),
  notes: z.string().trim().max(2000).default(''),
});
const assetPatchSchema = assetInputSchema.partial();

type Ticket = z.infer<typeof ticketInputSchema> & {
  id: string;
  approval: '' | 'Approved' | 'Rejected';
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
};

type Asset = z.infer<typeof assetInputSchema> & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

async function readTickets(): Promise<Ticket[]> {
  return readJsonFile<Ticket[]>(ticketsFile, []);
}

async function saveTickets(tickets: Ticket[]) {
  await writeFile(ticketsFile, JSON.stringify(tickets, null, 2));
}

async function readAssets(): Promise<Asset[]> {
  return readJsonFile<Asset[]>(assetsFile, []);
}

async function saveAssets(assets: Asset[]) {
  await writeFile(assetsFile, JSON.stringify(assets, null, 2));
}

function createTicketId(tickets: Ticket[], createdAt: Date) {
  const datePart = createdAt.toISOString().slice(0, 10).replaceAll('-', '');
  const sequence = tickets.reduce((highest, ticket) => {
    const match = ticket.id.match(new RegExp(`^J-${datePart}-(\d{4})$`));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  return `J-${datePart}-${String(sequence).padStart(4, '0')}`;
}

function createAssetId(assets: Asset[], createdAt: Date) {
  const datePart = createdAt.toISOString().slice(0, 10).replaceAll('-', '');
  const sequence = assets.reduce((highest, asset) => {
    const match = asset.id.match(new RegExp(`^A-${datePart}-(\d{4})$`));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  return `A-${datePart}-${String(sequence).padStart(4, '0')}`;
}

function sendValidationError(res: express.Response, error: z.ZodError) {
  return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง', issues: error.issues });
}

app.use(cors());
app.use(express.json());

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
    res.json(assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/summary', async (_req, res, next) => {
  try {
    const tickets = await readTickets();
    const assets = await readAssets();
    const byCategory = tickets.reduce<Record<string, number>>((result, ticket) => {
      result[ticket.category] = (result[ticket.category] ?? 0) + 1;
      return result;
    }, {});
    const byAssetStatus = {
      Available: assets.filter((asset) => asset.status === 'Available').length,
      'In Use': assets.filter((asset) => asset.status === 'In Use').length,
      Maintenance: assets.filter((asset) => asset.status === 'Maintenance').length,
      Retired: assets.filter((asset) => asset.status === 'Retired').length,
    };
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
      assetSummary: {
        total: assets.length,
        available: byAssetStatus.Available,
        inUse: byAssetStatus['In Use'],
        maintenance: byAssetStatus.Maintenance,
        retired: byAssetStatus.Retired,
      },
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

app.post('/api/assets', async (req, res, next) => {
  try {
    const input = assetInputSchema.parse(req.body);
    const now = new Date().toISOString();
    const assets = await readAssets();
    const asset: Asset = {
      ...input,
      id: createAssetId(assets, new Date(now)),
      createdAt: now,
      updatedAt: now,
    };
    assets.push(asset);
    await saveAssets(assets);
    res.status(201).json(asset);
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
    tickets[index] = { ...tickets[index], ...patch, updatedAt: new Date().toISOString() };
    await saveTickets(tickets);
    res.json(tickets[index]);
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
    if (index === -1) return res.status(404).json({ message: 'ไม่พบ Asset' });
    assets[index] = { ...assets[index], ...patch, updatedAt: new Date().toISOString() };
    await saveAssets(assets);
    res.json(assets[index]);
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
  console.error(error);
  res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ' });
});

app.listen(port, () => console.log(`Ticket API listening on http://localhost:${port}`));
