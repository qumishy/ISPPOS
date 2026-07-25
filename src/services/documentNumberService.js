import { execSQL } from './dbCore';

const pad2 = (n) => String(n).padStart(2, '0');
const pad4 = (n) => String(n).padStart(4, '0');

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeCode = (value) => {
  const cleaned = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, 8);
};

export const resolveAgentCode = async (agentId, projectId = null) => {
  const fallback = `A${normalizeCode(agentId).slice(-6) || '000000'}`;
  if (!agentId) return fallback;

  try {
    const info = await execSQL(`PRAGMA table_info(users)`);
    const columns = (info.rows._array || []).map(row => row.name);
    const codeColumn = ['agent_code', 'user_code', 'short_code', 'code']
      .find(column => columns.includes(column));
    const selectCols = ['id', 'username'];
    if (codeColumn) selectCols.push(codeColumn);

    const where = projectId ? `id = ? AND project_id = ?` : `id = ?`;
    const params = projectId ? [agentId, projectId] : [agentId];
    const r = await execSQL(
      `SELECT ${selectCols.join(', ')} FROM users WHERE ${where} LIMIT 1`,
      params
    );
    const user = r.rows._array?.[0];
    if (user && codeColumn) {
      const existingCode = normalizeCode(user[codeColumn]);
      if (existingCode) return existingCode;
    }
  } catch (e) { }

  return fallback;
};

export const getScopedMonthlyCodePrefix = async ({
  prefix,
  dateValue,
  agentId,
  projectId = null,
}) => {
  const baseDate = new Date(dateValue || new Date().toISOString());
  const d = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const agentCode = await resolveAgentCode(agentId, projectId);
  return {
    yyyy,
    mm,
    agentCode,
    value: `${prefix}-${yyyy}-${mm}-${agentCode}-`,
  };
};

export const getScopedMonthlySequentialCode = async ({
  table,
  column,
  prefix,
  dateValue,
  projectId,
  phaseId = null,
  agentId,
  agentColumn = 'agent_id',
  additionalCodes = [],
}) => {
  const codePrefix = await getScopedMonthlyCodePrefix({
    prefix,
    dateValue,
    agentId,
    projectId,
  });
  const where = [`${column} LIKE ?`];
  const params = [`${codePrefix.value}%`];

  if (projectId) {
    where.push(`project_id = ?`);
    params.push(projectId);
  }
  if (phaseId) {
    where.push(`phase_id = ?`);
    params.push(phaseId);
  }
  if (agentId) {
    where.push(`${agentColumn} = ?`);
    params.push(agentId);
  }

  const r = await execSQL(
    `SELECT ${column} as code FROM ${table} WHERE ${where.join(' AND ')}`,
    params
  );
  const rows = r.rows._array || [];
  const sequencePattern = new RegExp(`^${escapeRegExp(codePrefix.value)}(\\d{4})$`);
  let maxSeq = 0;

  for (const row of rows) {
    const match = String(row.code || '').match(sequencePattern);
    if (match) maxSeq = Math.max(maxSeq, Number(match[1] || 0));
  }

  for (const code of additionalCodes) {
    const match = String(code || '').match(sequencePattern);
    if (match) maxSeq = Math.max(maxSeq, Number(match[1] || 0));
  }

  return `${codePrefix.value}${pad4(maxSeq + 1)}`;
};
