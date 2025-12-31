import asyncHandler from 'express-async-handler';
import fs from 'fs/promises';
import path from 'path';
import Notification from '../models/NotificationModel.js';

const LOG_DIR = path.join(process.cwd(), 'logs');

// Helper to parse a log line like: "2025-12-15 17:06:26:626 info: message"
function parseLogLine(line) {
  if (!line || !line.trim()) return null;

  // Split timestamp and rest
  const firstSpace = line.indexOf(' ');
  if (firstSpace === -1) return { raw: line };

  const timestampPart = line.slice(0, 23).trim();
  const rest = line.slice(24).trim();

  const levelMatch = rest.match(/^(\w+):\s*/);
  const level = levelMatch ? levelMatch[1] : undefined;
  const message = levelMatch ? rest.slice(levelMatch[0].length) : rest;

  return {
    timestamp: timestampPart,
    level,
    message,
    raw: line,
  };
}

// GET /api/logs?file=all|error&level=info|error&limit=100&since=2025-12-15T00:00:00Z
const getLogs = asyncHandler(async (req, res) => {
  const file = req.query.file === 'error' ? 'error.log' : 'all.log';
  const levelFilter = req.query.level;
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
  const since = req.query.since ? new Date(req.query.since) : null;

  const filePath = path.join(LOG_DIR, file);
  let contents = '';
  try {
    contents = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    res.status(500);
    throw new Error(`Could not read log file: ${file}`);
  }

  const lines = contents.split('\n').filter(Boolean);

  const parsed = lines
    .map(parseLogLine)
    .filter(Boolean)
    .reverse(); // newest first

  const filtered = parsed.filter((entry) => {
    if (levelFilter && entry.level !== levelFilter) return false;
    if (since) {
      const t = new Date(entry.timestamp.replace(/:/, '.'));
      if (isNaN(t.getTime())) return true;
      if (t < since) return false;
    }
    return true;
  });

  res.json({ count: Math.min(filtered.length, limit), entries: filtered.slice(0, limit) });
});

// Notifications
const listNotifications = asyncHandler(async (req, res) => {
  const { unread, limit = 100, skip = 0 } = req.query;
  const q = {};
  if (unread === 'true') q.read = false;

  const items = await Notification.find(q)
    .sort({ createdAt: -1 })
    .skip(parseInt(skip, 10))
    .limit(Math.min(parseInt(limit, 10), 1000));

  res.json({ count: items.length, items });
});

const createNotification = asyncHandler(async (req, res) => {
  const { title, body, type, metadata } = req.body;
  if (!title || !body) {
    res.status(400);
    throw new Error('title and body are required');
  }

  const n = await Notification.create({
    title,
    body,
    type,
    metadata,
    createdBy: req.user ? req.user._id : undefined,
  });

  res.status(201).json(n);
});

const markRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const n = await Notification.findByIdAndUpdate(id, { read: true }, { new: true });
  if (!n) {
    res.status(404);
    throw new Error('Notification not found');
  }
  res.json(n);
});

const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const n = await Notification.findByIdAndDelete(id);
  if (!n) {
    res.status(404);
    throw new Error('Notification not found');
  }
  res.json({ success: true });
});

export {
  getLogs,
  listNotifications,
  createNotification,
  markRead,
  deleteNotification,
};
