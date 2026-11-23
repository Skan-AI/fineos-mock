import process from "node:process";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { LoginThrottle } from "../application/login-throttle";
import { authenticate, verifySessionToken } from "../application/session-service";
import { parse, send } from "./http";

const SESSION_COOKIE_NAME = "fineos_session";
const COOKIE_MAX_AGE_SECONDS = 43200;
const BEARER_PREFIX = "Bearer ";
const PRODUCTION_ENV = "production";

const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const buildSessionCookie = (token: string): string => {
  const secure = process.env.NODE_ENV === PRODUCTION_ENV ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}${secure}`;
};

const readCookieToken = (cookieHeader: string | undefined): string | undefined => {
  const match = (cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE_NAME.length + 1)) : undefined;
};

const readBearerToken = (authHeader: string | undefined): string | undefined =>
  authHeader?.startsWith(BEARER_PREFIX) ? authHeader.slice(BEARER_PREFIX.length).trim() : undefined;

export const readRequestSession = (req: FastifyRequest) =>
  verifySessionToken(readCookieToken(req.headers.cookie) ?? readBearerToken(req.headers.authorization));

const recordAttempt = (throttle: LoginThrottle, clientId: string, succeeded: boolean): void =>
  succeeded ? throttle.recordSuccess(clientId) : throttle.recordFailure(clientId);

export const registerSessionRoutes = (app: FastifyInstance, throttle: LoginThrottle): void => {
  app.post("/api/session", (req, reply) => {
    const body = parse(credentialsSchema, req.body);
    if (!body.ok) return send(reply, body);
    const allowed = throttle.check(req.ip);
    if (!allowed.ok) return send(reply, allowed);
    const result = authenticate(body.value);
    recordAttempt(throttle, req.ip, result.ok);
    if (result.ok) void reply.header("Set-Cookie", buildSessionCookie(result.value.token));
    return send(reply, result);
  });
  app.get("/api/session", (req, reply) => send(reply, readRequestSession(req)));
};

export const enforceSessionHook = (req: FastifyRequest, reply: FastifyReply, done: () => void): void => {
  if (isPublicApiRoute(req)) return done();
  if (!req.url.startsWith("/api")) return enforceWebRoute(req, reply, done);
  const session = readRequestSession(req);
  if (!session.ok) return send(reply, session);
  done();
};

const isPublicApiRoute = (req: FastifyRequest): boolean =>
  req.method === "POST" && (req.url === "/api/session" || req.url === "/api/test/reset");

const isPublicWebPath = (url: string): boolean =>
  url === "/" || url.startsWith("/login") || url.startsWith("/assets/") || url.includes(".");

const enforceWebRoute = (req: FastifyRequest, reply: FastifyReply, done: () => void): void => {
  if (req.method !== "GET" || isPublicWebPath(req.url) || readRequestSession(req).ok) return done();
  void reply.redirect("/login");
};
