import type { Request, Response } from "express";
import * as crypto from "crypto";

interface SessionData {
  traderId?: string;
  kotakLoggedIn?: boolean;
}

const sessions = new Map<string, SessionData>();

export function createSession(): string {
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, {});
  return sid;
}

export function getSession(req: Request): SessionData {
  const sid = req.cookies?.session_id || "";
  return sessions.get(sid) || {};
}

export function setSession(req: Request, data: Partial<SessionData>): void {
  const sid = req.cookies?.session_id || "";
  const existing = sessions.get(sid) || {};
  sessions.set(sid, { ...existing, ...data });
}

export function setSessionCookie(res: Response, sid: string): void {
  res.cookie("session_id", sid, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 86400 * 1000,
  });
}

export function clearSession(req: Request, res: Response): void {
  const sid = req.cookies?.session_id || "";
  sessions.delete(sid);
  res.clearCookie("session_id");
}
