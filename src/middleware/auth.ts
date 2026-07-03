import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface AuthedRequest extends Request {
  playerId?: string;
  playerName?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.session;
  if (!token) {
    res.status(401).json({ error: 'Non autenticato' });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { playerId: string; name: string };
    req.playerId = payload.playerId;
    req.playerName = payload.name;
    next();
  } catch {
    res.status(401).json({ error: 'Sessione non valida' });
  }
}
