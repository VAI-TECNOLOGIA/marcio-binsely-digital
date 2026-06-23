import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getAll = asyncHandler(async (req, res) => {
  const rows = await prisma.setting.findMany();
  const settings = {};
  rows.forEach((r) => {
    settings[r.key] = r.value;
  });
  res.json(settings);
});

export const get = asyncHandler(async (req, res) => {
  const row = await prisma.setting.findUnique({ where: { key: req.params.key } });
  res.json(row?.value ?? null);
});

export const upsert = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const value = req.body?.value ?? req.body;
  const row = await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  res.json(row);
});

export const listRoles = asyncHandler(async (req, res) => {
  const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
  res.json({ data: roles });
});
