import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  computeDaysAtTop,
  computeHeadToHeadStats,
  computeMatchTimeline,
  computePairStats,
  computePlayerStats,
} from '../services/stats';

export const statsRouter = Router();

statsRouter.use(requireAuth);

statsRouter.get('/players', async (_req, res) => {
  try {
    res.json(await computePlayerStats());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

statsRouter.get('/pairs', async (_req, res) => {
  try {
    res.json(await computePairStats());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

statsRouter.get('/head-to-head', async (_req, res) => {
  try {
    res.json(await computeHeadToHeadStats());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

statsRouter.get('/timeline', async (_req, res) => {
  try {
    res.json(await computeMatchTimeline());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

statsRouter.get('/days-at-top', async (_req, res) => {
  try {
    res.json(await computeDaysAtTop());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
