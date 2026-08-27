# OWNDAYS Ticket Management

ระบบจัดการ Ticket แยก frontend และ backend

## Stack

- Backend: Node.js, Express, TypeScript, Zod
- Frontend: React, Vite, TypeScript, Lucide React
- Storage เริ่มต้น: `backend/data/tickets.json`
- Ticket ID: `J-YYYYMMDD-0001` โดย running แยกตามวัน

## เริ่มต้นใช้งาน

```bash
npm install --prefix backend
npm install --prefix frontend
npm install
npm run dev
```

เปิด `http://localhost:5173`

API อยู่ที่ `http://localhost:4000`

- `GET /api/health`
- `GET /api/tickets`
- `POST /api/tickets`
- `PATCH /api/tickets/:id`
- `PATCH /api/tickets/:id/approval`
- `GET /api/reports/summary`

Demo login: `7748 / 6081` หรือ `IT02 / 456`

