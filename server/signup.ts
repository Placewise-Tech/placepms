import { createHmac, randomInt } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import nodemailer, { type SendMailOptions } from 'nodemailer';
import publicConfig from '../supabase.public.json' with { type: 'json' };

const successMessage = 'Check your email for your temporary login credentials. If you already have an account, sign in or use Forgot password.';
const emailPattern = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;

export class SignupError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function validateSignup(input: unknown) {
  if (!input || typeof input !== 'object') throw new SignupError(400, 'Enter your account details.');
  const fields = input as Record<string, unknown>;
  const email = typeof fields.email === 'string' ? fields.email.trim().toLowerCase() : '';
  const fullName = typeof fields.fullName === 'string' ? fields.fullName.trim() : '';
  const organization = typeof fields.organization === 'string' ? fields.organization.trim() : '';
  if (email.length > 254 || !emailPattern.test(email)) throw new SignupError(400, 'Enter a valid email address.');
  if (!fullName || fullName.length > 120 || /[\r\n\0]/.test(fullName)) throw new SignupError(400, 'Enter a full name of up to 120 characters.');
  if (!organization || organization.length > 200 || /[\r\n\0]/.test(organization)) throw new SignupError(400, 'Enter an organization of up to 200 characters.');
  if (fields.role !== undefined && fields.role !== 'student') throw new SignupError(400, 'Public registration is for student accounts only. Ask an administrator to create another role.');
  if (fields.agreeTerms !== true) throw new SignupError(400, 'Please agree to the Terms of Service and Privacy Policy.');
  return { email, fullName, organization, role: 'student' };
}

export function temporaryPassword() {
  // Supabase accepts this cryptographically random six-digit code as the initial password.
  return randomInt(100_000, 1_000_000).toString();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

interface SignupServices {
  admin: SupabaseClient;
  sendMail: (message: SendMailOptions) => Promise<unknown>;
  appUrl: string;
  senderEmail: string;
  senderName: string;
  rateLimitKey: string;
  logError: (message: string) => void;
}

export function temporaryLoginEmail({ email, fullName, code, appUrl, senderEmail, senderName }: {
  email: string; fullName: string; code: string; appUrl: string; senderEmail: string; senderName: string;
}): SendMailOptions {
  const loginUrl = new URL('/login', appUrl).href;
  return {
    from: { name: senderName, address: senderEmail },
    to: { name: fullName, address: email },
    subject: 'Your PlacePMS 6-digit login code',
    text: `Hello ${fullName},\n\nYour PlacePMS account is ready.\n\nLogin email: ${email}\nTemporary login code: ${code}\nSign in: ${loginUrl}\n\nEnter this 6-digit code in the Password field. After signing in, you must choose a new password before opening your workspace. This code stops working once you set your password.\n\nKeep this code private. If you did not request this account, you can ignore this email.\n\nThe PlacePMS team`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#182230;line-height:1.6"><h1 style="color:#2d7f62;font-size:24px">Your PlacePMS login code</h1><p>Hello ${escapeHtml(fullName)},</p><p>Use your email and this 6-digit code to sign in:</p><p><strong>Login email:</strong> ${escapeHtml(email)}</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#2d7f62">${escapeHtml(code)}</p><p><a href="${escapeHtml(loginUrl)}" style="color:#2d7f62;font-weight:bold">Sign in to PlacePMS</a></p><p>Enter the code in the <strong>Password</strong> field. After signing in, choose a new password to open your workspace. This code stops working once you set your password.</p><p>Keep this code private. If you did not request this account, you can ignore this email.</p><p>The PlacePMS team</p></div>`,
  };
}

export async function registerAccount(input: unknown, ip: string, services: SignupServices) {
  const { email, fullName, organization, role } = validateSignup(input);
  const { admin } = services;
  const hash = (value: string) => createHmac('sha256', services.rateLimitKey).update(value).digest('hex');
  // Database-backed limits work across Vercel instances; no raw IP/email is stored.
  const { data: allowed, error: limitError } = await admin.rpc('claim_signup_attempt', {
    p_ip_hash: hash(`ip:${ip}`), p_email_hash: hash(`email:${email}`),
  });
  if (limitError) throw new SignupError(503, 'Account creation is temporarily unavailable. Please try again later.');
  if (allowed !== true) throw new SignupError(429, 'Too many account requests. Please try again in an hour.');

  const password = temporaryPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName, college: organization, role },
    app_metadata: { must_change_password: true },
  });
  // Never reset or replace an existing account's credentials through public signup.
  if (error?.code === 'email_exists' || error?.code === 'user_already_exists') return successMessage;
  if (error || !data.user) throw new SignupError(503, 'Unable to create your account. Please try again later.');

  try {
    await services.sendMail(temporaryLoginEmail({
      email, fullName, code: password, appUrl: services.appUrl,
      senderEmail: services.senderEmail, senderName: services.senderName,
    }));
  } catch {
    // Roll back only the account created by this request so a failed send can be retried.
    // Do not log SMTP errors: providers may include credentials/message content.
    try {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id);
      if (cleanupError) services.logError('Signup email failed; account cleanup requires attention.');
    } catch { services.logError('Signup email failed; account cleanup requires attention.'); }
    throw new SignupError(502, 'We could not send your login email. Please try again. If your account already exists, use Forgot password.');
  }
  return successMessage;
}

export function createServices(env: NodeJS.ProcessEnv): SignupServices {
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const smtpUser = env.BREVO_SMTP_USER;
  const smtpPassword = env.BREVO_SMTP_PASSWORD;
  const senderEmail = env.BREVO_FROM_EMAIL;
  const appUrl = env.APP_URL;
  const port = Number(env.BREVO_SMTP_PORT || 587);
  if (!secret || !smtpUser || !smtpPassword || !senderEmail || !emailPattern.test(senderEmail) || !appUrl || ![465, 587, 2525].includes(port)) {
    throw new SignupError(503, 'Account email delivery is not configured yet. Please contact the PlacePMS administrator.');
  }
  const site = new URL(appUrl);
  if (site.protocol !== 'https:' && !(site.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname))) {
    throw new SignupError(503, 'The account login URL is not configured correctly.');
  }
  const transport = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com', port, secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: smtpUser, pass: smtpPassword },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  return {
    admin: createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL || publicConfig.url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    sendMail: async message => {
      const result = await transport.sendMail(message);
      if (!result.accepted.length || result.rejected.length) throw new Error('Email was not accepted.');
    },
    appUrl: site.origin, senderEmail, senderName: env.BREVO_FROM_NAME || 'PlacePMS',
    rateLimitKey: secret, logError: message => console.error(message),
  };
}

async function readBody(request: IncomingMessage & { body?: unknown }) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new SignupError(415, 'Send account details as JSON.');
  if (Number(request.headers['content-length']) > 8192) throw new SignupError(413, 'The account request is too large.');
  let body = request.body;
  if (body === undefined) {
    let text = '';
    for await (const chunk of request) {
      text += chunk.toString();
      if (Buffer.byteLength(text) > 8192) throw new SignupError(413, 'The account request is too large.');
    }
    body = text;
  }
  if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > 8192) throw new SignupError(413, 'The account request is too large.');
  try { return typeof body === 'string' ? JSON.parse(body) : body; }
  catch { throw new SignupError(400, 'Invalid account request.'); }
}

export function createSignupHandler(env: NodeJS.ProcessEnv = process.env) {
  return async (request: IncomingMessage & { body?: unknown }, response: ServerResponse) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      response.statusCode = 405;
      response.end(JSON.stringify({ error: 'Use POST to create an account.' }));
      return;
    }
    try {
      const input = await readBody(request);
      const forwarded = request.headers['x-forwarded-for'];
      // Vercel supplies this header. Locally, ignore client-supplied proxy headers.
      const ip = env.VERCEL === '1' && typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.socket.remoteAddress || 'local';
      const services = createServices(env);
      const registration = await services.admin.rpc('workspace_signup_open');
      if (registration.error) throw new SignupError(503, 'Apply the workspace management migration to configure registration.');
      if (registration.data !== true) throw new SignupError(403, 'Public registration is closed. Contact your administrator for an account.');
      const message = await registerAccount(input, ip, services);
      response.statusCode = 202;
      response.end(JSON.stringify({ message }));
    } catch (cause) {
      response.statusCode = cause instanceof SignupError ? cause.status : 503;
      if (response.statusCode === 429) response.setHeader('Retry-After', '3600');
      response.end(JSON.stringify({ error: cause instanceof SignupError ? cause.message : 'Account creation is temporarily unavailable. Please try again later.' }));
    }
  };
}
